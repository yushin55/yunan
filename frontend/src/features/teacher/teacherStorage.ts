// Teacher-only notes and finished games, kept in this browser. Nothing here goes to the server.
import type { ReportEdits } from "./report";
import type { DiscussionSummary, GameSettings, ModerationEntry, Participant, Phase, Reveal, Topic, TranscriptLine } from "../../types/game";

/** One note: about a student (`uid`) or the class in general (`uid: null`). */
export interface MemoEntry {
  id: string;
  uid: string | null;
  text: string;
  at: number;
}
export type PhaseNotes = Partial<Record<Phase, MemoEntry[]>>;

/** Notes saved before students could be picked were one string per phase; they become one general note. */
export function normalizeNotes(raw: unknown): PhaseNotes {
  const out: PhaseNotes = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [phase, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      if (value.trim()) out[phase as Phase] = [{ id: `legacy-${phase}`, uid: null, text: value, at: 0 }];
    } else if (Array.isArray(value)) {
      const list = value.filter((e): e is MemoEntry => !!e && typeof e.text === "string" && e.text.trim() !== "");
      if (list.length) out[phase as Phase] = list;
    }
  }
  return out;
}

export const countNotes = (notes: PhaseNotes) => Object.values(notes).reduce((n, list) => n + (list?.length ?? 0), 0);

export interface PastDebate {
  key: string;
  roomCode: string;
  topic: Topic;
  createdAt: number;
  endedAt: number;
  practice: boolean;
  participants: Participant[];
  transcript: TranscriptLine[];
  moderation: ModerationEntry[];
  reveal?: Reveal;
  summary?: DiscussionSummary;
  settings?: GameSettings;
  notes: PhaseNotes;
}

const NOTES = "bridge.teacherNotes.";
const EDITS = "bridge.reportEdits.";
const HISTORY = "bridge.debateHistory";
const KEEP = 30;

/** One game: practice rooms reuse their id, so the start time keeps them apart. */
export const gameKey = (roomId: string, createdAt: number) => `${roomId}-${createdAt}`;

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) || "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage full or unavailable: the screen still works, it just won't be remembered. */
  }
}

export const loadNotes = (key: string) => normalizeNotes(read<unknown>(NOTES + key, {}));
export const saveNotes = (key: string, notes: PhaseNotes) => write(NOTES + key, notes);

export const loadEdits = (key: string) => read<ReportEdits>(EDITS + key, {});
export const saveEdits = (key: string, edits: ReportEdits) => write(EDITS + key, edits);

export const loadHistory = () => read<PastDebate[]>(HISTORY, []).map((d) => ({ ...d, notes: normalizeNotes(d.notes) }));

export const loadDebate = (key: string) => loadHistory().find((d) => d.key === key) ?? null;

export function saveDebate(debate: PastDebate) {
  const rest = loadHistory().filter((d) => d.key !== debate.key);
  write(HISTORY, [debate, ...rest].slice(0, KEEP));
}

export function deleteDebate(key: string) {
  write(HISTORY, loadHistory().filter((d) => d.key !== key));
  try {
    localStorage.removeItem(NOTES + key);
    localStorage.removeItem(EDITS + key);
  } catch {
    /* ignore */
  }
}
