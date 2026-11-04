import { useState } from "react";
import { ChevronDown, Siren } from "lucide-react";
import type { EventCard as Event } from "../types/game";

/** The event card; `collapsible` lets the discussion fold it down to its title. */
export default function EventCard({ event, collapsible = false, defaultOpen = true }: { event: Event; collapsible?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;
  return (
    <article className={`event-card${collapsible ? " collapsible" : ""}${shown ? "" : " folded"}`} aria-label={`사건 카드: ${event.title}`}>
      {collapsible ? (
        <button className="event-card-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="card-kind">
            <Siren size={14} aria-hidden /> 사건
          </span>
          <h3>{event.title}</h3>
          <ChevronDown size={18} className="chev" aria-hidden />
        </button>
      ) : (
        <>
          <span className="card-kind">
            <Siren size={14} aria-hidden /> 사건 카드
          </span>
          <h3>{event.title}</h3>
        </>
      )}
      {shown && (
        <>
          <p>{event.description}</p>
          <small>가상의 상황이에요. 실제 학교나 사람의 이야기가 아니에요.</small>
        </>
      )}
    </article>
  );
}
