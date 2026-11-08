import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
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
 * The cards float in one row over the bottom of the table, each with a short summary readable at a
 * glance. Pressing one opens everything that person said.
 */
export default function CardStrip({ cards }: { cards: TableCard[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const card = cards.find((c) => c.uid === open);
  // The cards grow to fit their whole summary; the table's floating panels stop above them.
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
  return (
    <section ref={deck} className="card-deck" aria-label="카드 · 누르면 전체 내용을 볼 수 있어요">
      <ul className="card-deck-row">
        {cards.map((c) => (
          <li key={c.uid}>
            <button
              type="button"
              className={`deck-card ${c.state}${c.tone ? ` ${c.tone}` : ""}`}
              style={c.color ? ({ "--seat": c.color } as React.CSSProperties) : undefined}
              onClick={() => setOpen(c.uid)}
              data-testid="table-card"
            >
              <span className="deck-card-head">
                {c.tone === "event" ? <span className="deck-card-no stamp">사건</span> : c.order !== undefined && <span className="deck-card-no">{c.order}</span>}
                {c.state === "speaking" && c.tone !== "event" && <span className="deck-card-live">말하는 중</span>}
              </span>
              <span className="deck-card-who">
                <strong>{c.name}</strong>
                <small>{c.role}</small>
              </span>
              <span className={`deck-card-text${c.text ? "" : " empty"}`}>{c.text || emptyText(c)}</span>
              <span className="deck-card-more">
                {c.record?.length ? `전체 기록 ${c.record.length}개` : "자세히 보기"} <ChevronRight size={15} aria-hidden />
              </span>
            </button>
          </li>
        ))}
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
