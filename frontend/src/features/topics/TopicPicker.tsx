import { Check, Shuffle, Users } from "lucide-react";
import TopicArt from "../briefing/TopicArt";
import type { Topic } from "../../types/game";

/** The six reviewed topics as picture cards. Random only ever picks one of these. */
export default function TopicPicker({
  topics,
  selected,
  randomSelected = false,
  onSelect,
  onRandom,
  disabled,
}: {
  topics: Topic[];
  selected: string | null;
  randomSelected?: boolean;
  onSelect: (topicId: string) => void;
  onRandom: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="topic-cards" role="radiogroup" aria-label="토론 주제">
      {topics.map((topic, i) => {
        const on = selected === topic.topicId;
        return (
          <button
            key={topic.topicId}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={topic.title}
            className={`topic-card${on ? " selected" : ""}`}
            onClick={() => onSelect(topic.topicId)}
            disabled={disabled}
          >
            <span className="topic-card-art">
              <TopicArt topicId={topic.topicId} shot={i} />
              <span className="topic-card-no">{String(i + 1).padStart(2, "0")}</span>
              {on && (
                <span className="topic-card-check">
                  <Check size={18} aria-hidden />
                </span>
              )}
            </span>
            <span className="topic-card-body">
              <span className="topic-card-tag">{topic.shortTitle}</span>
              <strong>{topic.title}</strong>
              <span className="topic-card-roles">
                <Users size={13} aria-hidden /> {topic.roles.map((r) => r.name).join(" · ")}
              </span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        role="radio"
        aria-checked={randomSelected}
        aria-label="무작위 주제"
        className={`topic-card random${randomSelected ? " selected" : ""}`}
        onClick={onRandom}
        disabled={disabled}
      >
        <span className="topic-card-art random-art">
          <span className="dice" aria-hidden>
            <Shuffle size={42} />
          </span>
          {randomSelected && (
            <span className="topic-card-check">
              <Check size={18} aria-hidden />
            </span>
          )}
        </span>
        <span className="topic-card-body">
          <span className="topic-card-tag">무작위</span>
          <strong>6개 주제 중 하나를 무작위로</strong>
          <span className="topic-card-roles">시작할 때 정해져요</span>
        </span>
      </button>
    </div>
  );
}
