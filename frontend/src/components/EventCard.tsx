import { Fragment, useState } from "react";
import { ChevronDown, Siren } from "lucide-react";
import type { EventCard as Event } from "../types/game";

/** Quoted words (‘…’, “…”) are what people said or worried about: shown in bold. */
function withQuotes(text: string) {
  return text.split(/([‘“'][^’”']+[’”'])/).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** One sentence per line; the last one, where the story lands, stands out. */
export function EventText({ text }: { text: string }) {
  const sentences = text.match(/[^.!?。]+[.!?。]+["”’]?\s*|[^.!?。]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  return (
    <div className="event-text">
      {sentences.map((s, i) => (
        <p key={i} className={i === sentences.length - 1 && sentences.length > 1 ? "event-key" : undefined}>
          {withQuotes(s)}
        </p>
      ))}
    </div>
  );
}

/** The event card; `collapsible` lets the discussion fold it down to its title. */
export default function EventCard({ event, collapsible = false, defaultOpen = true }: { event: Event; collapsible?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;
  return (
    <article className={`event-card${collapsible ? " collapsible" : ""}${shown ? "" : " folded"}`} aria-label={`사건 카드: ${event.title}`}>
      {collapsible ? (
        <button className="event-card-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="card-kind">사건</span>
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
          <EventText text={event.description} />
        </>
      )}
    </article>
  );
}
