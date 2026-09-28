import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { api, ApiError } from "../lib/api";
import { authenticate, db } from "../lib/firebase";
import { loadPractice, practiceAction } from "../lib/practice";
import type { Snapshot } from "../types/game";
export function useRoom(roomId: string, practice: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    practice ? loadPractice() : null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  // Ignore late HTTP responses that would rewind a newer phase or room revision.
  const receive = useCallback(
    (next: Snapshot) =>
      setSnapshot((current) => {
        if (
          current?.room.roomId === next.room.roomId &&
          (next.room.phaseVersion < current.room.phaseVersion ||
            (next.room.revision ?? 0) < (current.room.revision ?? 0))
        )
          return current;
        return next;
      }),
    [],
  );
  const refresh = useCallback(async () => {
    if (practice) return;
    try {
      receive(await api(`/api/rooms/${roomId}/me`));
      setConnected(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setConnected(false);
    }
  }, [roomId, practice, receive]);
  const action = useCallback(
    async (name: string, body: Record<string, unknown> = {}) => {
      if (name !== "sync") setBusy(true);
      setError("");
      try {
        const next = practice
          ? practiceAction(name, body)
          : await api(`/api/rooms/${roomId}/${name}`, body);
        receive(next);
        setConnected(true);
        return next;
      } catch (e) {
        setError((e as Error).message);
        if (e instanceof ApiError && e.status === 409) void refresh();
        return null;
      } finally {
        if (name !== "sync") setBusy(false);
      }
    },
    [roomId, practice, receive, refresh],
  );
  useEffect(() => {
    if (practice) return;
    let alive = true;
    let stop: (() => void) | undefined;
    const sync = async () => {
      try {
        const next = await api(`/api/rooms/${roomId}/sync`, {
          phaseVersion: latest.current?.room.phaseVersion,
        });
        if (alive) {
          receive(next);
          setConnected(true);
        }
      } catch (e) {
        if (alive) {
          setConnected(false);
          setError((e as Error).message);
        }
      }
    };
    void authenticate()
      .then(() => {
        if (!alive) return;
        stop = onSnapshot(
          doc(db, "rooms", roomId),
          () => void refresh(),
          () => setConnected(false),
        );
        void sync();
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    const online = () => {
      void sync();
    };
    const offline = () => setConnected(false);
    const visibility = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 60000);
    return () => {
      alive = false;
      stop?.();
      clearInterval(heartbeat);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [practice, roomId, refresh, receive]);
  useEffect(() => {
    if (!snapshot?.room.phaseEndsAt) return;
    const delay = Math.max(
      100,
      snapshot.room.phaseEndsAt - (snapshot.serverNow ?? Date.now()) + 250,
    );
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      const next = await action("sync", {
        phaseVersion: snapshot.room.phaseVersion,
      });
      if (
        !cancelled &&
        (!next ||
          (next.room.phaseVersion === snapshot.room.phaseVersion &&
            next.room.phaseEndsAt &&
            next.room.phaseEndsAt <= (next.serverNow ?? Date.now())))
      )
        retry = setTimeout(sync, 5000);
    };
    const timer = setTimeout(sync, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(retry);
    };
  }, [
    snapshot?.room.phaseEndsAt,
    snapshot?.room.phaseVersion,
    snapshot?.serverNow,
    action,
  ]);
  return { snapshot, error, busy, connected, action, refresh };
}
