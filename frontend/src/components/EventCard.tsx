import { Siren } from "lucide-react";
import type { EventCard as Event } from "../types/game";

export default function EventCard({ event }: { event: Event }) {
  return (
    <article className="event-card" aria-label={`사건 카드: ${event.title}`}>
      <span className="card-kind">
        <Siren size={14} aria-hidden /> 사건 카드
      </span>
      <h3>{event.title}</h3>
      <p>{event.description}</p>
      <small>가상의 상황이에요. 실제 학교나 사람의 이야기가 아니에요.</small>
    </article>
  );
}
