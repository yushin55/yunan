import { useEffect, useState } from "react";
import { phaseSection } from "../features/game/phases";
import type { Room } from "../types/game";

/**
 * A section just started (the server's `holdUntil`): its title covers every screen until the hold
 * ends, and only then can anyone talk. Everyone sees it for the same moment, even after a reload.
 */
/** Milliseconds left in the section's opening hold (0 when it is over); re-renders the moment it ends. */
export function useHoldLeft(room: Room, offset: number) {
  const until = room.holdUntil ?? 0;
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const left = until - (Date.now() + offset);
    setNow(Date.now() + offset);
    if (left <= 0) return;
    const t = setTimeout(() => setNow(Date.now() + offset), left + 50);
    return () => clearTimeout(t);
  }, [until, offset]);
  return Math.max(0, until - now);
}

export default function PhaseBanner({ room, offset }: { room: Room; offset: number }) {
  const left = useHoldLeft(room, offset);
  const until = room.holdUntil ?? 0;
  const section = phaseSection(room);
  if (!section || left <= 0 || room.paused) return null;
  return (
    <div className="phase-banner" role="status" aria-live="assertive" data-testid="phase-banner" key={until} style={{ animationDuration: `${Math.max(left, 600)}ms` }}>
      <div>
        {section.sub && <small>{section.sub}</small>}
        <strong>{section.title}</strong>
      </div>
    </div>
  );
}
