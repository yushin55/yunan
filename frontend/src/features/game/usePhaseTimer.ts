import { useEffect, useState } from "react";
import type { Room } from "../../types/game";
import { formatSeconds } from "./phases";

export function usePhaseTimer(room: Room | undefined, offset: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!room) return { remaining: null, label: "" };
  if (room.paused && room.pausedRemainingMs !== null) {
    const remaining = Math.ceil(room.pausedRemainingMs / 1000);
    return { remaining, label: formatSeconds(remaining), paused: true };
  }
  if (!room.phaseEndsAt) return { remaining: null, label: "" };
  const remaining = Math.max(0, Math.ceil((room.phaseEndsAt - now - offset) / 1000));
  return { remaining, label: formatSeconds(remaining), paused: false };
}
