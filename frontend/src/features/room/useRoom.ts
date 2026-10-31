import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { api, ApiError } from "../../lib/api";
import { authenticate, db } from "../../lib/firebase";
import type { HostState, Me, ModerationResult, Participant, Room, Rounds, Snapshot, Viewer } from "../../types/game";
import { rememberRoom } from "./roomStorage";

export interface RoomState {
  viewer: Viewer;
  room: Room;
  participants: Participant[];
  rounds: Rounds;
  me?: Me;
  host?: HostState;
}

export type RoomStatus = "loading" | "ready" | "not-member" | "removed" | "error";

/**
 * Live room state. The API returns the first snapshot (and which view this account has);
 * after that every document is followed through Firestore listeners. Security rules decide
 * what each listener may read, so another student's private data never reaches this browser.
 */
export function useRoom(roomId: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<RoomStatus>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [offset, setOffset] = useState(0);
  const latest = useRef(state);
  latest.current = state;

  const adopt = useCallback((snapshot: Snapshot) => {
    if (snapshot.serverNow) setOffset(snapshot.serverNow - Date.now());
  }, []);

  const sync = useCallback(async () => {
    try {
      const next = await api(`/api/rooms/${roomId}/sync`, { phaseVersion: latest.current?.room.phaseVersion });
      adopt(next);
      setOnline(true);
      return next;
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setOnline(false);
      return null;
    }
  }, [roomId, adopt]);

  useEffect(() => {
    let alive = true;
    const stops: (() => void)[] = [];
    const patch = (update: (current: RoomState) => RoomState) =>
      setState((current) => (current ? update(current) : current));
    const lost = (e: { code?: string }) => {
      if (!alive) return;
      if (e.code === "permission-denied") setStatus("removed");
      else setOnline(false);
    };

    (async () => {
      let first: Snapshot;
      try {
        await authenticate();
        first = await api(`/api/rooms/${roomId}/me`);
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setStatus("not-member");
        else {
          setError((e as Error).message);
          setStatus("error");
        }
        return;
      }
      if (!alive) return;
      adopt(first);
      setState({ viewer: first.viewer, room: first.room, participants: first.participants, rounds: first.rounds, me: first.me, host: first.host });
      setStatus("ready");
      rememberRoom(roomId, first.viewer);
      const uid = first.viewer === "student" ? first.me!.uid : first.host!.uid;
      const root = `rooms/${roomId}`;
      stops.push(
        onSnapshot(doc(db, root), (snap) => {
          setOnline(true);
          if (snap.exists()) patch((s) => ({ ...s, room: snap.data() as Room }));
        }, lost),
        onSnapshot(collection(db, `${root}/participants`), (snap) => {
          const list = snap.docs.map((d) => d.data() as Participant).sort((a, b) => a.seat - b.seat);
          patch((s) => ({ ...s, participants: list }));
        }, lost),
        onSnapshot(collection(db, `${root}/publicRounds`), (snap) => {
          const rounds: Rounds = { statements: [], chat: [] };
          for (const d of snap.docs) {
            if (d.id === "statements") rounds.statements = d.data().items ?? [];
            else if (d.id === "chat") rounds.chat = d.data().items ?? [];
            else if (d.id === "reveal") rounds.reveal = d.data() as Rounds["reveal"];
          }
          patch((s) => ({ ...s, rounds }));
        }, lost),
        first.viewer === "student"
          ? onSnapshot(doc(db, `${root}/privatePlayers/${uid}`), (snap) => {
              if (snap.exists()) patch((s) => ({ ...s, me: { uid, ...(snap.data() as Omit<Me, "uid">) } }));
              else setStatus("removed");
            }, lost)
          : onSnapshot(doc(db, `${root}/host/state`), (snap) => {
              if (snap.exists()) patch((s) => ({ ...s, host: snap.data() as HostState }));
            }, lost),
      );
    })();

    const back = () => void sync();
    const away = () => setOnline(false);
    const visible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("online", back);
    window.addEventListener("offline", away);
    document.addEventListener("visibilitychange", visible);
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 45000);
    return () => {
      alive = false;
      stops.forEach((stop) => stop());
      clearInterval(heartbeat);
      window.removeEventListener("online", back);
      window.removeEventListener("offline", away);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [roomId, sync, adopt]);

  // Whoever is connected when the timer runs out asks the server to move on.
  // The server checks the deadline itself, so an early or duplicate request does nothing.
  const endsAt = state?.room.phaseEndsAt;
  const version = state?.room.phaseVersion;
  useEffect(() => {
    if (!endsAt) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const fire = async () => {
      await sync();
      if (latest.current?.room.phaseVersion === version) retry = setTimeout(fire, 4000);
    };
    const timer = setTimeout(fire, Math.max(200, endsAt - (Date.now() + offset) + 300));
    return () => {
      clearTimeout(timer);
      clearTimeout(retry);
    };
  }, [endsAt, version, offset, sync]);

  const action = useCallback(
    async (name: string, body: Record<string, unknown> = {}) => {
      setBusy(true);
      setError("");
      try {
        const next = await api<Snapshot & { moderation?: ModerationResult }>(`/api/rooms/${roomId}/${name}`, body);
        adopt(next);
        setOnline(true);
        return next;
      } catch (e) {
        setError((e as Error).message);
        if (e instanceof ApiError && e.status === 0) setOnline(false);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [roomId, adopt],
  );

  return { state, status, error, setError, busy, online, offset, action };
}

export type RoomApi = ReturnType<typeof useRoom>;
