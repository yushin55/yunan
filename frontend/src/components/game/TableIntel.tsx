import type { CSSProperties } from "react";
import type { Phase, Snapshot } from "../../types/game";
import { PHASE_LABELS, PLAYER_COLORS, REACTIONS, REVIEW_PHASES } from "../../types/game";
import { SUSPICION_LABELS } from "../../hooks/usePlayerNotes";
import type { PlayerNotes, Suspicion } from "../../hooks/usePlayerNotes";
import { ArrowRight, Check, LockKeyhole, NotebookPen, X } from "../common/Icon";
import { getRoleName } from "./ActionPanel";
import "./TableIntel.css";

const INPUT_PHASES: Phase[] = ["initial", "claim", "scenario", "question", "guess", "reflection"];
export const PICK_PHASES: Phase[] = ["question", "guess", "reveal"];
const TAGS = Object.keys(SUSPICION_LABELS) as Suspicion[];

type Statement = { key: string; tag: string; text: string; sub?: string };

function nickname(s: Snapshot, uid?: string) {
  return s.participants.find((p) => p.uid === uid)?.nickname || "참가자";
}

export function playerColor(s: Snapshot, uid: string) {
  return PLAYER_COLORS[Math.max(0, s.participants.findIndex((p) => p.uid === uid)) % PLAYER_COLORS.length];
}

/** Everything a player has said in public, oldest first. */
export function playerStatements(s: Snapshot, uid: string): Statement[] {
  const topic = s.room.topic;
  const cardTitle = (id?: string) => id ? topic?.roles.flatMap((r) => r.cards).find((c) => c.id === id)?.title : undefined;
  const silent = "시간 내 답하지 않았어요.";
  const out: Statement[] = [];
  const reactionLine = (round: "claim" | "scenario") => {
    const got = (s.rounds.reactions || []).filter((r) => r.round === round && r.targetUid === uid);
    const parts = REACTIONS.map((kind) => [kind.icon, got.filter((r) => r.kind === kind.kind).length] as const)
      .filter(([, count]) => count).map(([icon, count]) => `${icon}${count}`);
    return parts.length ? `받은 반응 · ${parts.join(" ")}` : undefined;
  };
  s.rounds.claim?.forEach((r, i) => {
    if (r.uid !== uid) return;
    const card = cardTitle(r.cardId);
    out.push({
      key: `claim-${i}`, tag: PHASE_LABELS.claim, text: r.timedOut ? silent : r.text || "",
      sub: [card && `근거 카드 · ${card}${r.cardConnection ? ` — ${r.cardConnection}` : ""}`, reactionLine("claim")].filter(Boolean).join("\n") || undefined,
    });
  });
  s.rounds.scenario?.forEach((r, i) => {
    if (r.uid !== uid) return;
    const option = topic?.scenario.options.find((o) => o.id === r.optionId)?.text;
    const card = cardTitle(r.cardId);
    out.push({
      key: `scenario-${i}`, tag: PHASE_LABELS.scenario,
      text: r.timedOut ? silent : option || "",
      sub: [r.reason && `이유 · ${r.reason}`, card && `근거 카드 · ${card}`, reactionLine("scenario")].filter(Boolean).join("\n") || undefined,
    });
  });
  s.rounds.question?.forEach((r, i) => {
    if (r.uid === uid) {
      out.push({ key: `ask-${i}`, tag: `${nickname(s, r.targetUid)}에게 질문`, text: r.timedOut ? silent : r.text || "", sub: r.answer ? `받은 답 · ${r.answer}` : undefined });
    } else if (r.targetUid === uid && r.answer) {
      out.push({ key: `answer-${i}`, tag: `${nickname(s, r.uid)}의 질문에 답변`, text: r.answer, sub: r.text ? `Q · ${r.text}` : undefined });
    }
  });
  return out;
}

function statusOf(s: Snapshot, uid: string) {
  const phase = s.room.phase;
  const review = !!REVIEW_PHASES[phase];
  if (!INPUT_PHASES.includes(phase) && !review) return null;
  const done = s.participants.find((p) => p.uid === uid)?.submitted?.includes(phase);
  if (review) return done ? "확인 완료" : "보는 중";
  return done ? "제출 완료" : "생각 중";
}

/** Always-available roster of the other seats: status, public role and your private mark. */
export function OpponentRail({ snapshot: s, focusedUid, notes, onSelect, onOpenNotes }: {
  snapshot: Snapshot; focusedUid?: string; notes: PlayerNotes;
  onSelect: (uid: string) => void; onOpenNotes: () => void;
}) {
  const others = s.participants.filter((p) => p.uid !== s.me.uid);
  return <nav className="table-rail" aria-label="테이블의 인물">
    <div className="table-rail__head"><span>테이블의 인물</span><small>{others.length}명</small></div>
    <ul>
      {others.map((p) => {
        const status = statusOf(s, p.uid);
        const note = notes.players[p.uid];
        return <li key={p.uid}>
          <button
            type="button"
            className={"table-rail__player" + (focusedUid === p.uid ? " is-active" : "")}
            data-testid="rail-player"
            data-player-uid={p.uid}
            aria-pressed={focusedUid === p.uid}
            aria-label={`${p.nickname} 살펴보기${status ? `, ${status}` : ""}${note?.tag ? `, 내 표시 ${SUSPICION_LABELS[note.tag]}` : ""}`}
            title={p.nickname}
            style={{ "--seat-color": playerColor(s, p.uid) } as CSSProperties}
            onClick={() => onSelect(p.uid)}
          >
            <span className="table-rail__avatar" aria-hidden="true">
              {p.nickname.slice(0, 1)}
              {status && <i className={status === "제출 완료" || status === "확인 완료" ? "is-done" : ""} />}
            </span>
            <span className="table-rail__text">
              <strong>{p.nickname}</strong>
              <small>{p.roleId ? getRoleName(s.room.topic, p.roleId) : status || "자리에 앉음"}</small>
            </span>
            <span className="table-rail__marks" aria-hidden="true">
              {note?.tag && <em className={`tag-${note.tag}`}>{SUSPICION_LABELS[note.tag]}</em>}
              {note?.text?.trim() && <NotebookPen size={12} />}
              {(status === "제출 완료" || status === "확인 완료") && <Check size={12} />}
            </span>
          </button>
        </li>;
      })}
    </ul>
    <button type="button" className="table-rail__notes" onClick={onOpenNotes}><NotebookPen size={14} /><span>추리 메모</span></button>
  </nav>;
}

function SuspicionPicker({ uid, name, notes }: { uid: string; name: string; notes: PlayerNotes }) {
  const current = notes.players[uid]?.tag;
  return <div className="table-tags" role="group" aria-label={`${name}에 대한 내 표시`}>
    {TAGS.map((tag) => <button key={tag} type="button" className={`tag-${tag}` + (current === tag ? " is-on" : "")} aria-pressed={current === tag}
      onClick={() => notes.setPlayerTag(uid, current === tag ? undefined : tag)}>{SUSPICION_LABELS[tag]}</button>)}
  </div>;
}

/** Close-up card for the focused opponent: their public words plus your private memo. */
export function PlayerDossier({ snapshot: s, uid, notes, missionOpen, onClose, onMission }: {
  snapshot: Snapshot; uid: string; notes: PlayerNotes; missionOpen: boolean;
  onClose: () => void; onMission: () => void;
}) {
  const person = s.participants.find((p) => p.uid === uid);
  if (!person) return null;
  const statements = playerStatements(s, uid);
  const status = statusOf(s, uid);
  const picking = PICK_PHASES.includes(s.room.phase);
  const memoId = `dossier-memo-${uid}`;
  return <aside className="table-dossier" data-testid="immersive-focus" aria-label={`${person.nickname} 정보`}
    style={{ "--seat-color": playerColor(s, uid) } as CSSProperties}>
    <header className="table-dossier__head">
      <span className="table-dossier__avatar" aria-hidden="true">{person.nickname.slice(0, 1)}</span>
      <div>
        <strong>{person.nickname}</strong>
        <small>{getRoleName(s.room.topic, person.roleId)}{status ? ` · ${status}` : ""}</small>
      </div>
      <button type="button" className="table-dossier__close" aria-label="캐릭터 선택 해제" onClick={onClose}><X size={16} /></button>
    </header>
    <div className="table-dossier__body">
      <section className="table-dossier__words" aria-label="공개된 발언">
        <h3>공개된 발언</h3>
        {statements.length ? <ol>{statements.map((row) => <li key={row.key}>
          <span>{row.tag}</span>
          <p>{row.text}</p>
          {row.sub && <small>{row.sub}</small>}
        </li>)}</ol> : <p className="table-dossier__empty">이야기가 시작되면 이 사람의 말이 여기에 남습니다.</p>}
      </section>
      <section className="table-dossier__memo" aria-label="내 메모">
        <h3><LockKeyhole size={12} /> 내 메모 <small>이 기기에만 저장</small></h3>
        <SuspicionPicker uid={uid} name={person.nickname} notes={notes} />
        <label className="visually-hidden" htmlFor={memoId}>{person.nickname}에 대한 메모</label>
        <textarea id={memoId} value={notes.players[uid]?.text ?? ""} maxLength={400} rows={4}
          placeholder="말투, 근거, 앞뒤가 다른 부분을 적어 두세요."
          onChange={(e) => notes.setPlayerText(uid, e.target.value)} />
      </section>
    </div>
    {missionOpen && picking && <button type="button" className="table-dossier__mission" onClick={onMission}>
      {person.nickname} 선택하고 미션 카드로 <ArrowRight size={15} />
    </button>}
  </aside>;
}

/** All private notes in one place, opened from the table tools. */
export function NotesBoard({ snapshot: s, notes, onFocus }: { snapshot: Snapshot; notes: PlayerNotes; onFocus: (uid: string) => void }) {
  const others = s.participants.filter((p) => p.uid !== s.me.uid);
  return <div className="notes-board">
    <h2>추리 메모</h2>
    <p>나만 볼 수 있는 메모입니다. 이 기기의 브라우저에만 저장되고 서버로 보내지지 않아요.</p>
    <label className="notes-board__label" htmlFor="notes-table">테이블 전체 메모</label>
    <textarea id="notes-table" value={notes.table} maxLength={600} rows={3} placeholder="흐름, 의심 가는 조합, 다음에 물어볼 것…" onChange={(e) => notes.setTableText(e.target.value)} />
    {others.map((p) => <section key={p.uid} className="notes-board__person" style={{ "--seat-color": playerColor(s, p.uid) } as CSSProperties}>
      <div className="notes-board__person-head">
        <span className="table-dossier__avatar" aria-hidden="true">{p.nickname.slice(0, 1)}</span>
        <div><strong>{p.nickname}</strong><small>{getRoleName(s.room.topic, p.roleId)}</small></div>
        <button type="button" onClick={() => onFocus(p.uid)}>발언 보기 ↗</button>
      </div>
      <SuspicionPicker uid={p.uid} name={p.nickname} notes={notes} />
      <label className="visually-hidden" htmlFor={`notes-${p.uid}`}>{p.nickname}에 대한 메모</label>
      <textarea id={`notes-${p.uid}`} value={notes.players[p.uid]?.text ?? ""} maxLength={400} rows={2} placeholder="메모를 남겨 두세요." onChange={(e) => notes.setPlayerText(p.uid, e.target.value)} />
    </section>)}
  </div>;
}
