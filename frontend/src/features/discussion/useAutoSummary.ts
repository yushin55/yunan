import { useEffect, useRef, useState } from "react";
import type { TranscriptLine } from "../../types/game";

const AFTER_LAST_LINE = 4000;
const MIN_GAP = 25000;

/** Refreshes the summary a little after new lines arrive, at most every 25 seconds. */
export function useAutoSummary(lines: TranscriptLine[], refresh: () => Promise<unknown>) {
  const [status, setStatus] = useState<"idle" | "working" | "failed">("idle");
  const signature = lines.map((l) => l.id + l.text).join("\n");
  const latest = useRef({ signature, refresh });
  latest.current = { signature, refresh };
  const done = useRef("");
  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!signature || signature === done.current || timer.current) return;
    const run = async () => {
      timer.current = null;
      const target = latest.current.signature;
      if (target === done.current) return;
      lastRun.current = Date.now();
      setStatus("working");
      try {
        await latest.current.refresh();
        setStatus("idle");
      } catch {
        setStatus("failed");
      }
      done.current = target; // A failure waits for the next line instead of retrying in a loop.
      if (latest.current.signature !== target) timer.current = setTimeout(run, MIN_GAP);
    };
    timer.current = setTimeout(run, Math.max(AFTER_LAST_LINE, MIN_GAP - (Date.now() - lastRun.current)));
  }, [signature]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    },
    [],
  );
  return status;
}
