import { useCallback, useEffect, useRef, useState } from "react";
import type { ModerationResult, Snapshot } from "../../types/game";
import type { RoomApi } from "../room/useRoom";
import { act, createPractice, PracticeError, tick, type PracticeState } from "./engine";

const KEY = "bridge.practice";

function load(): PracticeState | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    return value?.version === 2 ? value : null;
  } catch {
    return null;
  }
}

function save(state: PracticeState | null) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* Practice still works without storage; it just won't survive a reload. */
  }
}

/** Same shape as useRoom, so the real student screen runs on top of the offline engine. */
export function usePractice() {
  const [practice, setPractice] = useState<PracticeState | null>(load);
  const [error, setError] = useState("");
  const current = useRef(practice);

  const commit = useCallback((next: PracticeState | null) => {
    current.current = next;
    setPractice(next);
    save(next);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!current.current) return;
      const next = tick(current.current);
      if (next) commit(next);
    }, 500);
    return () => clearInterval(timer);
  }, [commit]);

  const action = useCallback(
    async (name: string, body: Record<string, unknown> = {}): Promise<(Snapshot & { moderation?: ModerationResult }) | null> => {
      if (!current.current) return null;
      setError("");
      try {
        const result = act(current.current, name, body);
        commit(result.state);
        return { ...result.state.snapshot, moderation: result.moderation };
      } catch (e) {
        if (!(e instanceof PracticeError)) throw e;
        setError(e.message);
        return null;
      }
    },
    [commit],
  );

  const api: RoomApi = { state: practice?.snapshot ?? null, status: "ready", error, setError, busy: false, online: true, offset: 0, action };
  return {
    api,
    started: Boolean(practice),
    begin: (nickname: string, topicId: string | null) => commit(createPractice(nickname, topicId)),
    reset: () => commit(null),
  };
}
