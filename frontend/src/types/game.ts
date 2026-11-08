export type Phase = "lobby" | "role" | "statement" | "event" | "rebuttal" | "vote" | "reveal" | "ended";
export type TimedPhase = "role" | "statement" | "event" | "rebuttal" | "vote";
export type SpeakingPhase = "statement" | "event" | "rebuttal";
export type SpeechKind = "statement" | "question" | "rebuttal" | "answer";
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
  /** How long one person can hold the microphone on the open floor (questions, answers, rebuttals). */
  micSeconds: number;
}

/** Whose turn it is during the statements. `phaseEndsAt` is the deadline of this turn. */
export interface Turn {
  order: string[];
  index: number;
  uid: string;
  /** After everyone's statement comes a time when anyone can ask about them or answer ("qa"). */
  stage?: "speech" | "qa";
}

/** The one microphone in the room. `version` is the phaseVersion what is said gets recorded under. */
export interface Floor {
  uid: string;
  kind: SpeechKind;
  version: number;
  endsAt: number;
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
  turn: Turn | null;
  floor: Floor | null;
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

/** A stretch of speech, written down. Each turn can have several. */
export interface TranscriptLine {
  id: string;
  uid: string;
  phase: SpeakingPhase;
  kind: SpeechKind;
  /** The phaseVersion of the turn it was said in. */
  turn: number;
  /** Order within the recording; clips can arrive out of order. */
  clip?: number | null;
  text: string;
  source: "voice" | "typed";
  at: number;
  viaTeacher?: boolean;
  editedAt?: number;
}

export interface DiscussionSummary {
  positions: { roleId: string; points: string[] }[];
  clashes: string[];
  questions: string[];
  /** One short line per person who gave a statement: what goes on their card. */
  statements?: { uid: string; text: string }[];
  source: "ai" | "local";
  revision: number;
  at: number;
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
  transcript: TranscriptLine[];
  summary?: DiscussionSummary;
  reveal?: Reveal;
}

/** Visible only to the student it belongs to (Firestore privatePlayers/{uid}). */
export interface Me {
  uid: string;
  preferences: { first: string; second: string } | null;
  roleId: string | null;
  isSwitcher: boolean | null;
  preferenceRank: 1 | 2 | null;
  vote: string[] | null;
}

/** A line held back from the shared record until the teacher decides. */
export interface ModerationEntry extends TranscriptLine {
  nickname: string;
  status: "flagged" | "pending_review" | "approved" | "returned";
  category: "profanity" | "personal_attack" | "mockery" | null;
  excerpt: string | null;
  verdictSource: "rules" | "ai" | "none";
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

export interface TopicCatalog {
  topics: Topic[];
  config: {
    minStudents: number;
    maxStudents: number;
    switcherCounts: number[];
    defaultSwitcherCount: number;
    phaseSeconds: Record<TimedPhase, number>;
    micSeconds: number;
    phaseSecondsRange: { min: number; max: number };
    textLimits: { line: number; nickname: number };
  };
}
