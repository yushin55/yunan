import type { ReactNode } from "react";
import type { Room } from "../../types/game";
import { PHASE_LABELS, PHASE_ORDER, PHASE_SHORT, TEACHER_TODO } from "../game/phases";
import { usePhaseTimer } from "../game/usePhaseTimer";

const STEPS = PHASE_ORDER.filter((p) => p !== "ended");

/**
 * The teacher's steering wheel, pinned at the top: where the game is, what to do now,
 * the clock and the buttons that move it on. Everything needed to run the class without scrolling.
 */
export default function RunBar({ room, offset, hideTimer, notice, children }: { room: Room; offset: number; hideTimer?: boolean; notice?: string[]; children?: ReactNode }) {
  const timer = usePhaseTimer(room, offset);
  const index = STEPS.indexOf(room.phase === "ended" ? "reveal" : room.phase);
  const urgent = !timer.paused && timer.remaining !== null && timer.remaining <= 10;
  const todo = room.paused ? "진행을 멈춰 두었어요. 재개하면 남은 시간부터 이어져요." : notice?.length ? notice.join(" · ") : TEACHER_TODO[room.phase];
  return (
    <section className={`run-bar${room.paused ? " paused" : ""}`} aria-label="진행" aria-live="polite">
      <div className="run-info">
        <ol className="run-steps" aria-label="게임 단계">
          {STEPS.map((p, i) => (
            <li key={p} className={i < index ? "done" : i === index ? "current" : ""} aria-current={i === index ? "step" : undefined}>
              {PHASE_SHORT[p]}
            </li>
          ))}
        </ol>
        <div className="run-title">
          <h2>{PHASE_LABELS[room.phase]}</h2>
          <p className={`run-todo${room.paused || notice?.length ? " warn" : ""}`}>{todo}</p>
        </div>
      </div>
      {timer.label && !hideTimer && (
        <div className={`run-timer${urgent ? " urgent" : ""}${timer.paused ? " paused" : ""}`} role="timer" aria-label={`남은 시간 ${timer.label}`}>
          <span>{timer.paused ? "멈춤" : "남은 시간"}</span>
          <strong>{timer.label}</strong>
        </div>
      )}
      {children && <div className="run-actions">{children}</div>}
    </section>
  );
}
