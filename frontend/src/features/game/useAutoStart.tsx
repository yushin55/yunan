import { useEffect, useRef, useState } from "react";
import type { Participant, Room } from "../../types/game";

const COUNTDOWN_MS = 3000;

/** Everyone in the lobby has picked their roles and the table is big enough to start. */
export function allReady(room: Room | undefined, participants: Participant[] = []) {
  const n = participants.length;
  return room?.phase === "lobby" && n >= room.minStudents && n <= room.maxStudents && participants.every((p) => p.prefsDone);
}

/**
 * Counts 3, 2, 1 once everyone is ready, then calls `onStart` once. Every screen shows the same
 * count; only the one that runs the game (the teacher's, or practice) passes `onStart`.
 * ponytail: the count starts when each screen sees everyone ready, so screens can be a moment apart.
 */
export function useAutoStart(ready: boolean, onStart?: () => void) {
  const [left, setLeft] = useState<number | null>(null);
  const startRef = useRef(onStart);
  startRef.current = onStart;
  useEffect(() => {
    if (!ready) {
      setLeft(null);
      return;
    }
    const end = Date.now() + COUNTDOWN_MS;
    const tick = () => {
      const ms = end - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) {
        clearInterval(timer);
        startRef.current?.();
      }
    };
    const timer = setInterval(tick, 200);
    tick();
    return () => clearInterval(timer);
  }, [ready]);
  return left;
}

export function StartCountdown({ left }: { left: number | null }) {
  if (left === null) return null;
  return (
    <div className="start-countdown" role="status" aria-live="assertive" data-testid="start-countdown">
      <span>모두 역할을 골랐어요</span>
      <strong key={left}>{left || "시작!"}</strong>
    </div>
  );
}
