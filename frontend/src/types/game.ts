export type Phase = "lobby" | "role" | "statement" | "event" | "rebuttal" | "vote" | "reveal" | "ended";
export type TimedPhase = "role" | "statement" | "event" | "rebuttal" | "vote";
export type MessageKind = "response" | "question" | "answer" | "rebuttal";
export type Viewer = "host" | "student";

export interface Role {
  id: string;
  name: string;
  intro: string;
  goal: string;
  concerns: string[];
}

export interface BriefingSource {
  id: string;
  publisher: string;
  title: string;
  date: string;
  url: string;
}

/** A short pre-game summary of real, cited reporting about the topic. */
export interface Briefing {
  asOf: string;
  note: string;
  scenes: { title: string; lines: string[]; sourceIds?: string[] }[];
  sources: BriefingSource[];
}

export interface Topic {
  topicId: string;
  title: string;
  shortTitle: string;
  situation: string;
  version: number;
  isHypothetical: boolean;
  roles: Role[];
  questionPrompts: string[];
  briefing: Briefing;
}

export interface EventCard {
  id: string;
  title: string;
  description: string;
}

export interface GameSettings {
  switcherCount: 1 | 2;
  phaseSeconds: Record<TimedPhase, number>;
}

export interface Room {
  roomId: string;
  code: string;
  hostUid: string;
  phase: Phase;
  phaseVersion: number;
  phaseEndsAt: number | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  participantCount: number;
  minStudents: number;
  maxStudents: number;
  topicId: string;
  topic: Topic;
  event: EventCard | null;
  settings: GameSettings;
  createdAt: number;
  endedAt: number | null;
}

export interface Participant {
  uid: string;
  nickname: string;
  seat: number;
  joinedAt: number;
  connectedAt: number;
  prefsDone: boolean;
  submitted: string[];
  roleId?: string;
}

export interface StatementRow {
  uid: string;
  text?: string;
  at?: number;
  timedOut?: boolean;
  late?: boolean;
  viaTeacher?: boolean;
}

export interface ChatMessage {
  id: string;
  uid: string;
  phase: "event" | "rebuttal";
  kind: MessageKind;
  text: string;
  targetUid: string | null;
  at: number;
  viaTeacher?: boolean;
}

export interface Reveal {
  switcherCount: number;
  switchers: { uid: string; roleId: string }[];
  tally: { uid: string; votes: number }[];
  topVoted: string[];
  tiedUids: string[];
  tie: boolean;
  outcome: "found" | "partial" | "missed" | "tie" | "no_votes";
  ballots: { uid: string; voted: boolean; targets: string[]; correct: number }[];
}

export interface Rounds {
  statements: StatementRow[];
  chat: ChatMessage[];
  reveal?: Reveal;
}

export type NoticeStatus = "needs_edit" | "pending_review" | "returned" | "approved" | "withdrawn";

export interface Notice {
  id: string;
  kind: MessageKind | "statement";
  phase: Phase;
  status: NoticeStatus;
  hint: string | null;
  excerpt: string | null;
  text: string;
  targetUid: string | null;
  at: number;
}

/** Visible only to the student it belongs to (Firestore privatePlayers/{uid}). */
export interface Me {
  uid: string;
  preferences: { first: string; second: string } | null;
  roleId: string | null;
  isSwitcher: boolean | null;
  preferenceRank: 1 | 2 | null;
  vote: string[] | null;
  notices: Notice[];
}

export interface ModerationEntry {
  id: string;
  uid: string;
  nickname: string;
  kind: MessageKind | "statement";
  phase: Phase;
  text: string;
  targetUid: string | null;
  status: "flagged" | "pending_review" | "approved" | "returned" | "withdrawn";
  category: "profanity" | "personal_attack" | "mockery" | null;
  excerpt: string | null;
  source: "rules" | "ai" | "none";
  at: number;
}

/** Visible only to the teacher (Firestore host/state). */
export interface HostState {
  uid: string;
  teacherGuide: { summary: string; tips: string[]; caution?: string };
  moderation: ModerationEntry[];
}

export interface Snapshot {
  viewer: Viewer;
  room: Room;
  participants: Participant[];
  rounds: Rounds;
  me?: Me;
  host?: HostState;
  serverNow?: number;
}

export interface ModerationResult {
  status: "published" | "needs_edit" | "pending_review";
  messageId: string;
  hint?: string | null;
  excerpt?: string | null;
}

export interface TopicCatalog {
  topics: Topic[];
  config: {
    minStudents: number;
    maxStudents: number;
    switcherCounts: number[];
    defaultSwitcherCount: number;
    phaseSeconds: Record<TimedPhase, number>;
    phaseSecondsRange: { min: number; max: number };
    textLimits: { statement: number; message: number; nickname: number };
  };
}
