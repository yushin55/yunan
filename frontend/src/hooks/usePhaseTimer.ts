import { useEffect, useState } from "react";
export function usePhaseTimer(endsAt: number | null, serverNow?: number) {
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (serverNow) setOffset(serverNow - Date.now());
  }, [serverNow]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const remaining = endsAt
    ? Math.max(0, Math.ceil((endsAt - now - offset) / 1000))
    : null;
  return {
    remaining,
    label:
      remaining === null
        ? "준비 중"
        : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`,
  };
}
