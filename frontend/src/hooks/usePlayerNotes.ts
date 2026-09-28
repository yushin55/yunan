import { useCallback, useEffect, useState } from "react";

export type Suspicion = "suspect" | "unsure" | "trust";
export interface PlayerNote { text: string; tag?: Suspicion }
interface NoteBook { players: Record<string, PlayerNote>; table: string }

export const SUSPICION_LABELS: Record<Suspicion, string> = {
  suspect: "의심",
  unsure: "보류",
  trust: "신뢰",
};

const EMPTY: NoteBook = { players: {}, table: "" };

function read(key: string): NoteBook {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<NoteBook>;
    return { players: parsed.players && typeof parsed.players === "object" ? parsed.players : {}, table: typeof parsed.table === "string" ? parsed.table : "" };
  } catch {
    return EMPTY;
  }
}

/** Private deduction notes. They stay in this browser only and are never sent to the server. */
export function usePlayerNotes(roomId: string, uid: string | undefined) {
  const key = `yunan:notes:${roomId}:${uid ?? "guest"}`;
  const [book, setBook] = useState<NoteBook>(() => read(key));

  useEffect(() => { setBook(read(key)); }, [key]);

  const save = useCallback((next: NoteBook) => {
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Storage can be disabled. */ }
  }, [key]);

  const update = useCallback((recipe: (current: NoteBook) => NoteBook) => {
    setBook((current) => {
      const next = recipe(current);
      save(next);
      return next;
    });
  }, [save]);

  const setPlayerText = useCallback((playerUid: string, text: string) => update((b) => ({
    ...b, players: { ...b.players, [playerUid]: { ...b.players[playerUid], text } },
  })), [update]);

  const setPlayerTag = useCallback((playerUid: string, tag: Suspicion | undefined) => update((b) => ({
    ...b, players: { ...b.players, [playerUid]: { text: b.players[playerUid]?.text ?? "", tag } },
  })), [update]);

  const setTableText = useCallback((table: string) => update((b) => ({ ...b, table })), [update]);

  return { players: book.players, table: book.table, setPlayerText, setPlayerTag, setTableText };
}

export type PlayerNotes = ReturnType<typeof usePlayerNotes>;
