import { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import Sheet from "../../components/Sheet";

/** One card on the deck: a person's statement, the event, or a card of my own (picks, role). */
export interface TableCard {
  uid: string;
  /** The seat number; cards of my own may have none. */
  order?: number;
  name: string;
  role: string;
  /** What the card shows: the summary if there is one, otherwise what was said. */
  text: string;
  /** Everything this person said, in order, shown when the card is opened. */
  record?: { key: number; kind: string; text: string }[];
  state: "waiting" | "speaking" | "done";
  tone?: "event";
  /** They have spoken but the AI summary is not back yet. */
  summarizing?: boolean;
  /** The person's seat colour, so a card matches its character at the table. */
  color?: string;
}

const emptyText = (card: TableCard) =>
  card.state === "speaking" ? "말하는 중이에요" : card.summarizing ? "AI가 요약하는 중이에요" : card.state === "waiting" ? "아직 발표 전이에요" : "기록된 말이 없어요";

/**
 * The cards are held in my hand at the bottom of the table, fanned out, each showing only whose it
 * is. Pressing one lifts it up with its short summary; "자세히 보기" opens everything that person said.
 */
export default function CardStrip({ cards }: { cards: TableCard[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const card = cards.find((c) => c.uid === open);
  const peek = cards.find((c) => c.uid === lifted);
  // The hand's height tells the table how far to look down; the lifted card floats above and does not count.
  const deck = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = deck.current;
    const stage = node?.closest<HTMLElement>(".stage");
    if (!node || !stage) return;
    const watch = new ResizeObserver(() => stage.style.setProperty("--deck-h", `${node.offsetHeight}px`));
    watch.observe(node);
    return () => {
      watch.disconnect();
      stage.style.removeProperty("--deck-h");
    };
  }, []);
  // Esc puts the lifted card back.
  useEffect(() => {
    if (!peek || card) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLifted(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peek, card]);
  const mid = (cards.length - 1) / 2;
  return (
    <section ref={deck} className="card-deck" aria-label="손에 든 카드 · 누르면 요약을 볼 수 있어요">
      {peek && (
        <div
          className={`deck-card peek ${peek.state}${peek.tone ? ` ${peek.tone}` : ""}`}
          style={peek.color ? ({ "--seat": peek.color } as React.CSSProperties) : undefined}
          role="dialog"
          aria-label={`${peek.name} 카드`}
          data-testid="card-peek"
        >
          <span className="deck-card-head">
            {peek.tone === "event" ? <span className="deck-card-no stamp">사건</span> : peek.order !== undefined && <span className="deck-card-no">{peek.order}</span>}
            {peek.state === "speaking" && peek.tone !== "event" && <span className="deck-card-live">말하는 중</span>}
            <button type="button" className="deck-card-close" aria-label="카드 내려놓기" onClick={() => setLifted(null)}>
              <X size={16} />
            </button>
          </span>
          <span className="deck-card-who">
            <strong>{peek.name}</strong>
            <small>{peek.role}</small>
          </span>
          <span className={`deck-card-text${peek.text ? "" : " empty"}`}>{peek.text || emptyText(peek)}</span>
          <button type="button" className="deck-card-more" onClick={() => setOpen(peek.uid)} data-testid="card-more">
            {peek.record?.length ? `전체 기록 ${peek.record.length}개` : "자세히 보기"} <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      )}
      <ul className="card-hand">
        {cards.map((c, i) => {
          const tilt = i - mid;
          return (
            <li key={c.uid} style={{ "--tilt": tilt, "--drop": Math.abs(tilt) } as React.CSSProperties}>
              <button
                type="button"
                className={`hand-card ${c.state}${c.tone ? ` ${c.tone}` : ""}${lifted === c.uid ? " lifted" : ""}`}
                style={c.color ? ({ "--seat": c.color } as React.CSSProperties) : undefined}
                aria-pressed={lifted === c.uid}
                onClick={() => setLifted((current) => (current === c.uid ? null : c.uid))}
                data-testid="table-card"
              >
                {c.tone === "event" ? <span className="deck-card-no stamp">사건</span> : c.order !== undefined && <span className="deck-card-no">{c.order}</span>}
                <strong className="hand-card-name">{c.name}</strong>
                {c.state === "speaking" && c.tone !== "event" && <span className="hand-card-live" aria-label="말하는 중" />}
              </button>
            </li>
          );
        })}
      </ul>
      {card && (
        <Sheet title={card.order !== undefined ? `${card.order}. ${card.name}` : card.name} onClose={() => setOpen(null)} className="card-sheet">
          <div className="card-detail" data-testid="card-detail">
            <p className="card-detail-role">{card.role}</p>
            {card.record ? (
              <>
                {card.text && (
                  <section>
                    <h4>AI 요약</h4>
                    <p className="card-detail-summary">{card.text}</p>
                  </section>
                )}
                <section>
                  <h4>음성 기록 전체</h4>
                  {card.record.length ? (
                    <ol className="card-detail-record">
                      {card.record.map((r) => (
                        <li key={r.key}>
                          <span className="card-detail-kind">{r.kind}</span>
                          <p>{r.text}</p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="card-detail-empty">{card.state === "waiting" ? "아직 발표 전이에요" : card.state === "speaking" ? "말하는 중이에요" : "기록된 말이 없어요"}</p>
                  )}
                </section>
              </>
            ) : (
              <p>{card.text || emptyText(card)}</p>
            )}
          </div>
        </Sheet>
      )}
    </section>
  );
}
