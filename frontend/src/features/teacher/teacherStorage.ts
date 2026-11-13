// Account-scoped cache. TeacherWorkspace syncs it with the signed-in teacher's private records.
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

/** A claim in a student report and the ids of the transcript lines it rests on. */
export interface EvidencedText {
  text: string;
  evidence: string[];
}
export interface StudentAiReport {
  uid: string;
  overall: string;
  points: { criterion: string; comment: string; evidence: string[] }[];
  strengths: EvidencedText[];
  improvements: EvidencedText[];
  record: string;
}
/** What came back (AI or the offline stand-in) and the teacher's working copy of it. */
export interface StoredAiReports {
  source: "ai" | "local";
  at: number;
  original: StudentAiReport[];
  current: StudentAiReport[];
}

export interface PastDebate {
  key: string;
  roomId?: string;
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
const AI = "bridge.aiReports.";
const HISTORY = "bridge.debateHistory";
const KEEP = 30;
type RecordField = "notes" | "edits" | "aiReports" | "debate";
export interface TeacherRecord {
  key: string;
  notes?: PhaseNotes;
  edits?: ReportEdits;
  aiReports?: StoredAiReports;
  debate?: PastDebate;
}
type Sync = (key: string, field: RecordField | "delete", value?: unknown) => void;
let account = "guest";
let sync: Sync | undefined;
export const teacherStorageAccount = () => account;
export const teacherStorageLocation = () => account === "guest" ? "이 기기에" : "내 계정에";
const listeners = new Set<() => void>();
const cache = new Map<string, string>();
export const subscribeTeacherStorage = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const changed = () => queueMicrotask(() => listeners.forEach((listener) => listener()));
const scoped = (key: string) => `bridge.teacher.${encodeURIComponent(account)}.${key}`;

export function activateTeacherStorage(uid: string, onWrite: Sync) {
  account = uid;
  sync = onWrite;
  changed();
  return () => {
    if (sync !== onWrite) return;
    account = "guest";
    sync = undefined;
  };
}

/** Hydrate only records returned by the current account's protected Firestore path. */
export function replaceTeacherRecords(records: TeacherRecord[]) {
  const kept = new Set(records.flatMap((record) => [scoped(NOTES + record.key), scoped(EDITS + record.key), scoped(AI + record.key)]));
  try {
    for (const key of new Set([...cache.keys(), ...Object.keys(localStorage)])) {
      if ([NOTES, EDITS, AI].some((prefix) => key.startsWith(scoped(prefix))) && !kept.has(key)) {
        localStorage.removeItem(key);
        cache.delete(key);
        changed();
      }
    }
  } catch { /* The cloud remains the source of truth when browser storage is unavailable. */ }
  const history: PastDebate[] = [];
  for (const record of records) {
    write(NOTES + record.key, record.notes ?? {});
    write(EDITS + record.key, record.edits ?? {});
    write(AI + record.key, record.aiReports ?? null);
    if (record.debate) history.push({ ...record.debate, notes: normalizeNotes(record.notes ?? record.debate.notes) });
  }
  write(HISTORY, history.sort((a, b) => b.endedAt - a.endedAt).slice(0, KEEP));
}

/** One game: practice rooms reuse their id, so the start time keeps them apart. */
export const gameKey = (roomId: string, createdAt: number) => `${roomId}-${createdAt}`;

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(cache.get(scoped(key)) ?? localStorage.getItem(scoped(key)) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  if (cache.get(scoped(key)) === serialized) return false;
  cache.set(scoped(key), serialized);
  try {
    localStorage.setItem(scoped(key), serialized);
  } catch {
    /* The in-memory cache and account sync still work if localStorage is unavailable. */
  }
  changed();
  return true;
}

export const loadNotes = (key: string) => normalizeNotes(read<unknown>(NOTES + key, {}));
export const saveNotes = (key: string, notes: PhaseNotes) => { if (write(NOTES + key, notes)) sync?.(key, "notes", notes); };

export const loadEdits = (key: string) => read<ReportEdits>(EDITS + key, {});
export const saveEdits = (key: string, edits: ReportEdits) => { if (write(EDITS + key, edits)) sync?.(key, "edits", edits); };

export const loadAiReports = (key: string) => read<StoredAiReports | null>(AI + key, null);
export const saveAiReports = (key: string, value: StoredAiReports) => { if (write(AI + key, value)) sync?.(key, "aiReports", value); };

export const loadHistory = () => read<PastDebate[]>(HISTORY, []).map((d) => ({ ...d, notes: normalizeNotes(d.notes) }));

export const loadDebate = (key: string) => loadHistory().find((d) => d.key === key) ?? null;

export function saveDebate(debate: PastDebate) {
  if (JSON.stringify(loadDebate(debate.key)) === JSON.stringify(debate)) return;
  const rest = loadHistory().filter((d) => d.key !== debate.key);
  write(HISTORY, [debate, ...rest].slice(0, KEEP));
  sync?.(debate.key, "debate", debate);
}

export function deleteDebate(key: string) {
  write(HISTORY, loadHistory().filter((d) => d.key !== key));
  try {
    for (const prefix of [NOTES, EDITS, AI]) cache.delete(scoped(prefix + key));
    localStorage.removeItem(scoped(NOTES + key));
    localStorage.removeItem(scoped(EDITS + key));
    localStorage.removeItem(scoped(AI + key));
  } catch {
    /* ignore */
  }
  sync?.(key, "delete");
}
