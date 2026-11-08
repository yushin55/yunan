import { useCallback, useEffect, useRef, useState } from "react";
import type { Phase, Snapshot } from "../../types/game";
import type { RoomApi } from "../room/useRoom";
import { act, createPractice, createPracticeAt, PracticeError, teacherSnapshot, tick, type PracticeState } from "./engine";

const KEY = "bridge.practice";

function load(): PracticeState | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    return value?.version === 5 ? value : null;
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
    async (name: string, body: Record<string, unknown> = {}): Promise<Snapshot | null> => {
      if (!current.current) return null;
      setError("");
      try {
        const result = act(current.current, name, body);
        commit(result.state);
        return result.state.snapshot;
      } catch (e) {
        if (!(e instanceof PracticeError)) throw e;
        setError(e.message);
        return null;
      }
    },
    [commit],
  );

  const quiet = useCallback(
    async (name: string, body: Record<string, unknown> = {}) => {
      if (current.current) commit(act(current.current, name, body).state);
    },
    [commit],
  );

  const api: RoomApi = { state: practice?.snapshot ?? null, status: "ready", error, setError, busy: false, online: true, offset: 0, action, quiet };
  return {
    api,
    teacherApi: { ...api, state: practice ? teacherSnapshot(practice) : null } satisfies RoomApi,
    started: Boolean(practice),
    begin: (nickname: string, topicId: string | null) => commit(createPractice(nickname, topicId)),
    /** Start over at a given phase (teacher-screen preview). */
    beginAt: (nickname: string, topicId: string | null, phase: Phase) => commit(createPracticeAt(nickname, topicId, phase)),
    reset: () => commit(null),
  };
}
