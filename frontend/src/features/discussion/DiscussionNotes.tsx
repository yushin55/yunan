import { useEffect, useRef, useState } from "react";
import type { Floor, Participant, Room, Rounds } from "../../types/game";
import { KIND_LABEL } from "../game/phases";
import { exchangeRows, statementCards } from "./floor";

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
          </div>
        </li>
      ))}
    </ol>
  );
}

/** "민준 질문 …", "서연 답변 …": who asked and answered what, newest at the bottom. */
export function ExchangeFeed({ participants, rounds, floor, myUid }: { participants: Participant[]; rounds: Rounds; floor: Floor | null; myUid?: string }) {
  const rows = exchangeRows(rounds.transcript, floor);
  const list = useRef<HTMLOListElement>(null);
  const last = `${rows.length}.${rows.at(-1)?.text.length ?? 0}`;
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [last]);
  if (!rows.length) return <p className="muted small exchange-empty">아직 질문이 없어요. 궁금한 것이 있으면 먼저 눌러 주세요.</p>;
  return (
    <ol className="exchange-feed" ref={list} role="log" tabIndex={0} aria-label="질문과 답변" data-testid="exchange-feed">
      {rows.map((row) => {
        const person = participants.find((p) => p.uid === row.uid);
        return (
          <li key={row.key} className={`exchange-row kind-${row.kind}`} data-testid="exchange-row">
            <p className="exchange-who">
              <strong>{row.uid === myUid ? "나" : (person?.nickname ?? "나간 참가자")}</strong> {KIND_LABEL[row.kind]}
            </p>
            <p className={row.pending ? "muted" : undefined}>{row.pending ? "말하는 중이에요" : row.text}</p>
          </li>
        );
      })}
    </ol>
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
