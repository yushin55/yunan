import { Pause, Timer } from "lucide-react";
import type { Room } from "../types/game";
import { PHASE_LABELS, PHASE_ORDER, PHASE_SHORT } from "../features/game/phases";
import { usePhaseTimer } from "../features/game/usePhaseTimer";

export default function PhaseHeader({ room, offset, todo }: { room: Room; offset: number; todo: string }) {
  const timer = usePhaseTimer(room, offset);
  const steps = PHASE_ORDER.filter((p) => p !== "ended");
  const index = steps.indexOf(room.phase === "ended" ? "reveal" : room.phase);
  const urgent = !timer.paused && timer.remaining !== null && timer.remaining <= 10;
  return (
    <section className="phase-header" aria-live="polite">
      <ol className="steps" aria-label="게임 단계">
        {steps.map((phase, i) => (
          <li key={phase} className={i < index ? "done" : i === index ? "current" : ""} aria-current={i === index ? "step" : undefined}>
            <span>{PHASE_SHORT[phase]}</span>
          </li>
        ))}
      </ol>
      <div className="phase-title-row">
        <div>
          <span className="eyebrow">
            {room.phase === "lobby" || room.phase === "ended" ? "" : `${index}/${steps.length - 1} 단계 · `}
            {room.topic.shortTitle}
          </span>
          <h2>{PHASE_LABELS[room.phase]}</h2>
        </div>
        {timer.label && (
          <div className={`timer${urgent ? " urgent" : ""}${timer.paused ? " paused" : ""}`} role="timer" aria-label={`남은 시간 ${timer.label}`}>
            {timer.paused ? <Pause size={18} aria-hidden /> : <Timer size={18} aria-hidden />}
            <strong>{timer.label}</strong>
          </div>
        )}
      </div>
      {room.paused ? (
        <p className="todo paused-note">
          <Pause size={16} aria-hidden /> 선생님이 진행을 잠시 멈췄어요. 다시 시작하면 이어서 할 수 있어요.
        </p>
      ) : (
        <p className="todo">
          <strong>지금 할 일</strong> {todo}
        </p>
      )}
    </section>
  );
}
