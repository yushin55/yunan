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
export function MemoPad({ room }: { room: Room }) {
  const key = `bridge.memo.${room.roomId}.${room.createdAt}`;
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  const change = (value: string) => {
    setText(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* The note still works until the page closes. */
    }
  };
  return (
    <section className="memo-pad" data-testid="memo-pad">
      <label htmlFor="memo-text">
        내 메모 <span className="muted small">나만 보여요</span>
      </label>
      <textarea id="memo-text" rows={2} maxLength={MEMO_LIMIT} value={text} placeholder="누가 수상한지, 묻고 싶은 것을 적어 두세요" onChange={(e) => change(e.target.value)} />
    </section>
  );
}
