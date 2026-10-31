import { Box, Pause, Timer, UserRound, Wifi, WifiOff } from "lucide-react";
import type { Room } from "../types/game";
import { PHASE_ORDER, PHASE_SHORT } from "../features/game/phases";
import { usePhaseTimer } from "../features/game/usePhaseTimer";

const STEPS = PHASE_ORDER.filter((p) => p !== "ended");

/** Always-visible game status: where we are, how long is left, and who I am. */
export default function GameBar({
  room,
  offset,
  nickname,
  roleLabel,
  switcher,
  onRole,
  show3d,
  onToggle3d,
  online,
}: {
  room: Room;
  offset: number;
  nickname?: string;
  roleLabel?: string;
  switcher?: boolean;
  onRole?: () => void;
  show3d?: boolean;
  onToggle3d?: () => void;
  online: boolean;
}) {
  const timer = usePhaseTimer(room, offset);
  const index = STEPS.indexOf(room.phase === "ended" ? "reveal" : room.phase);
  const urgent = !timer.paused && timer.remaining !== null && timer.remaining <= 10;
  return (
    <header className="game-bar">
      <div className="game-bar-row">
        <span className="brand-mark game-bar-brand">
          브릿지<span>.</span>
        </span>
        <span className="phase-pill" data-testid="phase-pill">
          {room.phase !== "lobby" && room.phase !== "ended" && <em>{index}/{STEPS.length - 1}</em>}
          <strong>{room.phase === "ended" ? "게임 종료" : PHASE_SHORT[room.phase]}</strong>
        </span>
        {timer.label && (
          <span className={`bar-timer${urgent ? " urgent" : ""}${timer.paused ? " paused" : ""}`} role="timer" aria-label={`남은 시간 ${timer.label}`}>
            {timer.paused ? <Pause size={15} aria-hidden /> : <Timer size={15} aria-hidden />}
            <strong>{timer.label}</strong>
          </span>
        )}
        <span className="bar-spacer" />
        {roleLabel ? (
          <button className={`role-chip${switcher ? " switcher" : ""}`} onClick={onRole} aria-label={`내 역할 ${roleLabel} 보기`} data-testid="role-chip">
            <UserRound size={15} aria-hidden />
            <span>{roleLabel}</span>
          </button>
        ) : (
          nickname && <span className="bar-nick">{nickname}</span>
        )}
        {onToggle3d && (
          <button className="icon-button table-toggle" onClick={onToggle3d} aria-pressed={show3d} title={show3d ? "3D 원탁 끄기" : "3D 원탁 켜기"} aria-label={show3d ? "3D 원탁 끄기" : "3D 원탁 켜기"}>
            <Box size={16} />
          </button>
        )}
        <span className={`net ${online ? "on" : "off"}`} title={online ? "연결됨" : "연결이 끊겼어요"}>
          {online ? <Wifi size={16} aria-label="연결됨" /> : <WifiOff size={16} aria-label="연결 끊김" />}
        </span>
      </div>
      <ol className="bar-steps" aria-label="게임 단계">
        {STEPS.map((phase, i) => (
          <li key={phase} className={i < index ? "done" : i === index ? "current" : ""} aria-current={i === index ? "step" : undefined} title={PHASE_SHORT[phase]}>
            <span className="sr-only">{PHASE_SHORT[phase]}</span>
          </li>
        ))}
      </ol>
    </header>
  );
}
