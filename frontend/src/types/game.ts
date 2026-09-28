export type Phase =
  | "lobby"
  | "topic"
  | "initial"
  | "role"
  | "claim"
  | "claim_review"
  | "scenario"
  | "scenario_review"
  | "question"
  | "guess"
  | "reveal"
  | "reflection"
  | "results";
export type Position =
  | "support"
  | "conditional_support"
  | "neutral"
  | "conditional_oppose"
  | "oppose";
export interface Card {
  id: string;
  title: string;
  text: string;
  label: string;
  type: string;
}
export interface Role {
  id: string;
  name: string;
  goal: string;
  priority: string;
  stance: string;
  cards: Card[];
}
export interface Topic {
  topicId: string;
  title: string;
  shortTitle: string;
  background: string;
  question: string;
  tags: string[];
  isHypothetical: boolean;
  version: number;
  roles: Role[];
  scenario: {
    id: string;
    title: string;
    description: string;
    options: { id: string; text: string }[];
  };
  questions: string[];
}
export interface Participant {
  uid: string;
  nickname: string;
  ready: boolean;
  roleId?: string;
  submitted: string[];
  connectedAt?: number;
}
export interface Submission {
  uid: string;
  timedOut?: boolean;
  text?: string;
  optionId?: string;
  reason?: string;
  cardId?: string;
  cardConnection?: string;
  questionId?: string;
  targetUid?: string;
  answer?: string;
}
export type ReactionKind = "agree" | "convincing" | "rebut" | "curious";
export interface Reaction {
  uid: string;
  targetUid: string;
  round: "claim" | "scenario";
  kind: ReactionKind;
  at: number;
}
export interface Reflection {
  position: Position;
  understood: string;
  disagree: string;
  opinion: string;
  share: boolean;
}
export interface Breakdown {
  label: string;
  points: number;
  max: number;
  reason?: string;
}
export interface PlayerResult {
  uid: string;
  nickname?: string;
  total: number;
  breakdown: Breakdown[] | Record<string, unknown>;
  guessCorrect?: boolean;
  initialPosition?: { position: Position; reason: string };
  reflection?: Reflection;
}
export interface Snapshot {
  serverNow?: number;
  room: {
    roomId: string;
    code: string;
    hostUid: string;
    phase: Phase;
    phaseVersion: number;
    phaseEndsAt: number | null;
    topicId?: string;
    topicVersion?: number;
    topic?: Topic;
    participantCount: number;
    createdAt?: number;
    revision?: number;
    updatedAt?: number;
  };
  participants: Participant[];
  me: {
    uid: string;
    ratedTargets?: string[];
    initialPosition?: {
      position: Position;
      reason: string;
      preferences: string[];
    };
    preferences?: string[];
    roleId?: string;
    isSwitcher?: boolean;
    cards?: Card[];
    reflection?: Reflection;
    guess?: { targetUid: string; reason: string; clue: string };
  };
  rounds: {
    claim?: Submission[];
    scenario?: Submission[];
    question?: Submission[];
    reactions?: Reaction[];
    reveal?: { uid: string; roleId: string; isSwitcher: boolean }[];
    sharedReflections?: {
      uid: string;
      opinion?: string;
      reflection?: Reflection;
    }[];
  };
  results?: { players: PlayerResult[]; me: PlayerResult };
}
export const PHASES: Phase[] = [
  "lobby",
  "topic",
  "initial",
  "role",
  "claim",
  "claim_review",
  "scenario",
  "scenario_review",
  "question",
  "guess",
  "reveal",
  "reflection",
  "results",
];
export const PHASE_LABELS: Record<Phase, string> = {
  lobby: "라운지",
  topic: "오늘의 주제",
  initial: "나의 관점",
  role: "비밀 역할",
  claim: "입장 선언",
  claim_review: "입장 공개",
  scenario: "사건 대응",
  scenario_review: "대응 공개",
  question: "교차 질문",
  guess: "전환자 추리",
  reveal: "정체 공개",
  reflection: "진짜 목소리",
  results: "게임 결과",
};
export const POSITIONS: { value: Position; label: string }[] = [
  { value: "support", label: "찬성" },
  { value: "conditional_support", label: "조건부 찬성" },
  { value: "neutral", label: "판단 유보" },
  { value: "conditional_oppose", label: "조건부 반대" },
  { value: "oppose", label: "반대" },
];
export const PLAYER_COLORS = [
  "#dba767",
  "#8aa998",
  "#8e9ebc",
  "#ce9389",
  "#b0a1c5",
  "#c4bb7b",
];
/** After each public round, everyone looks over the other turns and reacts. */
export const REVIEW_PHASES: Partial<Record<Phase, "claim" | "scenario">> = {
  claim_review: "claim",
  scenario_review: "scenario",
};
export const REACTIONS: { kind: ReactionKind; icon: string; label: string }[] = [
  { kind: "agree", icon: "👍", label: "공감돼요" },
  { kind: "convincing", icon: "💡", label: "설득력 있어요" },
  { kind: "rebut", icon: "✋", label: "반박하고 싶어요" },
  { kind: "curious", icon: "❓", label: "더 듣고 싶어요" },
];
