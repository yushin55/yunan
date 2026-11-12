import { useState } from "react";
import type { Floor, Participant, Room, Rounds } from "../../types/game";
import { exchangeRows, statementCards, type ExchangeRow } from "./floor";

const MEMO_LIMIT = 500;

/** Each person's statement, boiled down: the same text as the cards in hand on the 3D table. */
export function StatementList({ room, participants, rounds, myUid }: { room: Room; participants: Participant[]; rounds: Rounds; myUid?: string }) {
  const cards = statementCards(room, participants, rounds, myUid);
  return (
    <ol className="statement-list" data-testid="statement-list">
      {cards.map((card) => (
        <li key={card.uid} className={card.state} data-testid="statement-item">
          <span className="statement-no">{card.order}</span>
          <div>
            <p className="statement-who">
              <strong>{card.name}</strong> {card.role && <span>{card.role}</span>}
            </p>
            <p className={card.text ? "statement-text" : "statement-text muted"}>{card.text || (card.state === "waiting" ? "아직 발표 전이에요" : card.state === "speaking" ? "말하는 중이에요" : "기록된 말이 없어요")}</p>
            {card.full && card.full !== card.text && <p className="statement-full">{card.full}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Just the questions ("Q. …"), each opening to the answers given after it — several people can
 * answer the same question. Questions about the statements and about the event are kept apart.
 */
export function QuestionList({ room, participants, rounds, floor, myUid }: { room: Room; participants: Participant[]; rounds: Rounds; floor: Floor | null; myUid?: string }) {
  const groups: { head: ExchangeRow; replies: ExchangeRow[] }[] = [];
  for (const row of exchangeRows(rounds.transcript, floor, room.phase)) {
    if (row.kind === "answer" && groups.length) groups.at(-1)!.replies.push(row);
    else groups.push({ head: row, replies: [] });
  }
  const who = (uid: string) => (uid === myUid ? "나" : (participants.find((p) => p.uid === uid)?.nickname ?? "나간 참가자"));
  const said = (row: ExchangeRow) => (row.pending ? "말하는 중이에요" : row.text);
  const grouped = groups.some((g) => g.head.phase !== groups[0].head.phase);
  if (!groups.length) return <p className="muted small exchange-empty">아직 질문이 없어요. 궁금한 것이 있으면 먼저 눌러 주세요.</p>;
  return (
    <div className="question-list" data-testid="question-list">
      {groups.map(({ head, replies }, i) => (
        <div key={head.key} className="question-group">
          {grouped && (i === 0 || groups[i - 1].head.phase !== head.phase) && <p className="question-about">{head.phase === "statement" ? "입장 발표에 대한 질문" : "사건에 대한 질문"}</p>}
          <details className={`question kind-${head.kind}`} data-testid="question">
            <summary>
              <b>{head.kind === "question" ? "Q." : head.kind === "rebuttal" ? "반론." : "A."}</b> <span className={head.pending ? "muted" : undefined}>{said(head)}</span>
              <small className="muted">
                {" "}
                · {who(head.uid)}
                {replies.length > 0 && ` · 답변 ${replies.length}`}
              </small>
            </summary>
            {replies.length ? (
              <ol className="question-replies">
                {replies.map((r) => (
                  <li key={r.key}>
                    <b>A.</b> <strong>{who(r.uid)}</strong> <span className={r.pending ? "muted" : undefined}>{said(r)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">아직 답변이 없어요.</p>
            )}
          </details>
        </div>
      ))}
    </div>
  );
}

/** A small private note. It never leaves this device: not to the server, the teacher or anyone else. */
function readNotes(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      const value = JSON.parse(raw);
      if (Array.isArray(value)) return value.filter((n): n is string => typeof n === "string" && n.trim() !== "");
    } catch {
      /* An older memo: one plain block of text. */
    }
    return raw.trim() ? [raw.trim()] : [];
  } catch {
    return [];
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* The memo still works until the page closes. */
  }
}

/**
 * My own notes for the whole game. Enter writes the line down, Shift+Enter starts a new line.
 * Kept in this browser per game, so moving to the next phase (or reloading) never loses them.
 */
export function MemoPad({ room }: { room: Room }) {
  const key = `bridge.memo.${room.roomId}.${room.createdAt}`;
  const [notes, setNotes] = useState(() => readNotes(key));
  const [draft, setDraft] = useState(() => {
    try {
      return localStorage.getItem(`${key}.draft`) ?? "";
    } catch {
      return "";
    }
  });
  const save = (next: string[]) => {
    setNotes(next);
    store(key, JSON.stringify(next));
  };
  const type = (value: string) => {
    setDraft(value);
    store(`${key}.draft`, value);
  };
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    save([...notes, text]);
    type("");
  };
  return (
    <section className="memo-pad" data-testid="memo-pad">
      <label htmlFor="memo-text">
        내 메모 <span className="muted small">나만 보여요</span>
      </label>
      {notes.length > 0 && (
        <ul className="memo-notes" data-testid="memo-notes">
          {notes.map((note, i) => (
            <li key={`${i}-${note}`}>
              <p>{note}</p>
              <button type="button" className="memo-note-remove" aria-label="이 메모 지우기" onClick={() => save(notes.filter((_, j) => j !== i))}>
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        id="memo-text"
        rows={2}
        maxLength={MEMO_LIMIT}
        value={draft}
        placeholder="누가 수상한지, 묻고 싶은 것을 적고 Enter"
        onChange={(e) => type(e.target.value)}
        onKeyDown={(e) => {
          // While Korean is still being composed, Enter only finishes the syllable.
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          add();
        }}
      />
      <p className="memo-hint muted small">Enter로 적어 두기 · Shift+Enter로 줄 바꾸기</p>
    </section>
  );
}
