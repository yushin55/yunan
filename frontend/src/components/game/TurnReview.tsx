import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Reaction, ReactionKind, Snapshot } from "../../types/game";
import { PHASE_LABELS, REACTIONS, REVIEW_PHASES } from "../../types/game";
import { SUSPICION_LABELS } from "../../hooks/usePlayerNotes";
import type { PlayerNotes, Suspicion } from "../../hooks/usePlayerNotes";
import { ArrowRight, Check } from "../common/Icon";
import { getRoleName } from "./ActionPanel";
import { playerColor } from "./TableIntel";
import "./TurnReview.css";

type Action = (name: string, body?: Record<string, unknown>) => Promise<Snapshot | null>;
const AUTO_MS = 7000;

function nameOf(s: Snapshot, uid: string) {
  return s.participants.find((p) => p.uid === uid)?.nickname || "참가자";
}

/** Practice reactions are scheduled a few seconds ahead; server reactions are already in the past. */
function useVisibleReactions(s: Snapshot, practice: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!practice) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [practice]);
  const round = REVIEW_PHASES[s.room.phase];
  return (s.rounds.reactions || []).filter((r) => r.round === round && (!practice || r.at <= now));
}

/**
 * Between rounds the table pauses: each player's turn is spotlighted in turn (the camera
 * follows), everyone can send a public reaction, and the game moves on once all are done.
 */
export default function TurnReview({ snapshot: s, practice, busy, action, focusUid, onFocus, notes }: {
  snapshot: Snapshot; practice: boolean; busy: boolean; action: Action;
  focusUid?: string; onFocus: (uid: string | undefined) => void; notes: PlayerNotes;
}) {
  const round = REVIEW_PHASES[s.room.phase]!;
  const me = s.me.uid;
  const speakers = [...s.participants.filter((p) => p.uid !== me), ...s.participants.filter((p) => p.uid === me)];
  // The page's focused player *is* the spotlight (my own turn focuses my uid, which the camera
  // treats as "look ahead"), so the roster, the room and this panel can never disagree.
  const found = speakers.findIndex((p) => p.uid === focusUid);
  const index = Math.max(0, found);
  const [auto, setAuto] = useState(true);
  const autoTarget = useRef<string | undefined>(undefined);
  const reactions = useVisibleReactions(s, practice);
  const speaker = speakers[Math.min(index, speakers.length - 1)];
  const isMe = speaker.uid === me;
  const row = s.rounds[round]?.find((r) => r.uid === speaker.uid);
  const done = s.participants.filter((p) => p.submitted?.includes(s.room.phase)).length;
  const iAmDone = !!s.participants.find((p) => p.uid === me)?.submitted?.includes(s.room.phase);

  // Start with the first speaker, and hand the camera back when the review ends.
  useEffect(() => {
    autoTarget.current = speakers[0].uid;
    onFocus(speakers[0].uid);
    return () => onFocus(undefined);
  }, []);

  // Any focus change we did not schedule (roster, nameplate, dots) means the viewer took over.
  useEffect(() => {
    if (focusUid && focusUid !== autoTarget.current) setAuto(false);
  }, [focusUid]);

  useEffect(() => {
    if (!auto || found < 0 || index >= speakers.length - 1) return;
    const timer = window.setTimeout(() => {
      autoTarget.current = speakers[index + 1].uid;
      onFocus(autoTarget.current);
    }, AUTO_MS);
    return () => window.clearTimeout(timer);
  }, [auto, index, found, speakers.length]);

  const go = (next: number) => { setAuto(false); onFocus(speakers[(next + speakers.length) % speakers.length].uid); };
  const received = reactions.filter((r) => r.targetUid === speaker.uid);
  const mine = reactions.find((r) => r.uid === me && r.targetUid === speaker.uid);
  const react = (kind: ReactionKind) => {
    setAuto(false);
    void action("react", { targetUid: speaker.uid, kind: mine?.kind === kind ? null : kind });
  };
  const option = round === "scenario" ? s.room.topic?.scenario.options.find((o) => o.id === row?.optionId)?.text : undefined;
  const card = row?.cardId ? s.room.topic?.roles.flatMap((r) => r.cards).find((c) => c.id === row.cardId) : undefined;
  const tag = notes.players[speaker.uid]?.tag;

  return (
    <section className="turn-review" data-testid="turn-review" aria-label={`${PHASE_LABELS[s.room.phase]} · 발언 확인`}
      style={{ "--seat-color": playerColor(s, speaker.uid) } as CSSProperties}>
      <header className="turn-review__head">
        <span className="turn-review__phase">{PHASE_LABELS[s.room.phase]}</span>
        <ol className="turn-review__dots" aria-label="발언 순서">
          {speakers.map((p, i) => (
            <li key={p.uid}>
              <button type="button" className={i === index ? "is-now" : ""} aria-current={i === index ? "true" : undefined}
                style={{ "--seat-color": playerColor(s, p.uid) } as CSSProperties} onClick={() => go(i)}
                aria-label={`${p.uid === me ? "나" : p.nickname}의 ${round === "claim" ? "입장" : "대응"} 보기`}>
                {p.uid === me ? "나" : p.nickname.slice(0, 1)}
              </button>
            </li>
          ))}
        </ol>
        <span className="turn-review__count">{index + 1} / {speakers.length}</span>
      </header>

      <div className="turn-review__body" key={speaker.uid}>
        <div className="turn-review__speaker">
          <span className="turn-review__avatar" aria-hidden="true">{isMe ? "나" : speaker.nickname.slice(0, 1)}</span>
          <div>
            <strong>{isMe ? "나의 " + (round === "claim" ? "입장" : "대응") : speaker.nickname}</strong>
            <small>{getRoleName(s.room.topic, speaker.roleId)}</small>
          </div>
        </div>
        <blockquote className="turn-review__words" data-testid="turn-words">
          {!row || row.timedOut ? <p className="is-empty">시간 안에 답하지 않았어요.</p> : round === "claim"
            ? <p>“{row.text}”</p>
            : <><p>{option}</p>{row.reason && <small>이유 · {row.reason}</small>}</>}
          {card && <span className="turn-review__card">근거 카드 · {card.title}{row?.cardConnection ? ` — ${row.cardConnection}` : ""}</span>}
        </blockquote>

        <div className="turn-review__reactions">
          {isMe ? <p className="turn-review__hint">내 발언에 도착한 반응이에요.</p> : (
            <div className="turn-review__react" role="group" aria-label={`${speaker.nickname}에게 반응 보내기`}>
              {REACTIONS.map((r) => (
                <button key={r.kind} type="button" disabled={busy} aria-pressed={mine?.kind === r.kind} onClick={() => react(r.kind)}>
                  <span aria-hidden="true">{r.icon}</span> {r.label}
                  {received.some((x) => x.kind === r.kind) && <em>{received.filter((x) => x.kind === r.kind).length}</em>}
                </button>
              ))}
            </div>
          )}
          <ul className="turn-review__received" aria-label="받은 반응">
            {received.length ? received.map((r) => <li key={r.uid}><b>{r.uid === me ? "나" : nameOf(s, r.uid)}</b> {REACTIONS.find((x) => x.kind === r.kind)?.icon} {REACTIONS.find((x) => x.kind === r.kind)?.label}</li>)
              : <li className="is-empty">아직 반응이 없어요.</li>}
          </ul>
        </div>

        {!isMe && (
          <div className="turn-review__mark" role="group" aria-label={`${speaker.nickname}에 대한 내 표시 (비공개)`}>
            <span>내 표시 · 비공개</span>
            {(Object.keys(SUSPICION_LABELS) as Suspicion[]).map((t) => (
              <button key={t} type="button" className={`tag-${t}` + (tag === t ? " is-on" : "")} aria-pressed={tag === t}
                onClick={() => notes.setPlayerTag(speaker.uid, tag === t ? undefined : t)}>{SUSPICION_LABELS[t]}</button>
            ))}
          </div>
        )}
      </div>

      <footer className="turn-review__foot">
        <button type="button" className="turn-review__nav" onClick={() => go(index - 1)} aria-label="이전 발언">‹</button>
        <button type="button" className="turn-review__nav" onClick={() => go(index + 1)} aria-label="다음 발언">›</button>
        {iAmDone
          ? <span className="turn-review__done"><Check size={15} /> 확인 완료 · {done} / {s.participants.length}명 준비</span>
          : <button type="button" className="turn-review__finish" data-testid="review-done" disabled={busy} onClick={() => void action("review-done")}>
              다 봤어요 <small>{done} / {s.participants.length}명 준비</small> <ArrowRight size={15} />
            </button>}
      </footer>
    </section>
  );
}

/** Live ticker of reactions as they arrive; ones aimed at me stand out. */
export function ReactionFeed({ snapshot: s, practice }: { snapshot: Snapshot; practice: boolean }) {
  const reactions = useVisibleReactions(s, practice);
  const seen = useRef<Set<string> | null>(null);
  const [items, setItems] = useState<(Reaction & { id: string })[]>([]);
  useEffect(() => {
    const key = (r: Reaction) => `${r.uid}:${r.targetUid}:${r.round}:${r.kind}:${r.at}`;
    // On (re)connect, reactions that already happened are history, not news.
    if (!seen.current) seen.current = new Set(practice ? [] : reactions.map(key));
    const fresh = reactions.filter((r) => r.uid !== s.me.uid && !seen.current!.has(key(r)));
    if (!fresh.length) return;
    fresh.forEach((r) => seen.current!.add(key(r)));
    setItems((v) => [...v, ...fresh.map((r) => ({ ...r, id: key(r) }))].slice(-3));
  }, [reactions.length, reactions.map((r) => r.at).join(",")]);
  useEffect(() => {
    if (!items.length) return;
    const timer = window.setTimeout(() => setItems((v) => v.slice(1)), 4200);
    return () => window.clearTimeout(timer);
  }, [items]);
  if (!items.length) return null;
  return (
    <div className="reaction-feed" aria-live="polite">
      {items.map((r) => {
        const info = REACTIONS.find((x) => x.kind === r.kind);
        const toMe = r.targetUid === s.me.uid;
        return <p key={r.id} className={toMe ? "is-me" : ""}>
          <span aria-hidden="true">{info?.icon}</span>
          <b>{nameOf(s, r.uid)}</b> → <b>{toMe ? "나" : nameOf(s, r.targetUid)}</b> · {info?.label}
        </p>;
      })}
    </div>
  );
}
