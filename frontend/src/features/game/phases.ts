import type { EventCard, Phase, Room, Snapshot, SpeechKind } from "../../types/game";

// No rebuttal: questions and answers run longer instead. "rebuttal" stays in `Phase` only for old records.
// After the event comes the last reasoning (`deduce`): anyone says whom they suspect, then the vote.
export const PHASE_ORDER: Phase[] = ["lobby", "role", "statement", "event", "deduce", "vote", "reveal", "ended"];

export const PHASE_LABELS: Record<Phase, string> = {
  lobby: "대기실",
  role: "역할 확인",
  statement: "입장 발표",
  event: "사건 발생",
  rebuttal: "반론",
  deduce: "최후 추론",
  vote: "투표",
  reveal: "결과",
  ended: "게임 종료",
};

export const PHASE_SHORT: Record<Phase, string> = {
  lobby: "대기실",
  role: "역할 확인",
  statement: "입장 발표",
  event: "사건 발생",
  rebuttal: "반론",
  deduce: "최후 추론",
  vote: "투표",
  reveal: "결과",
  ended: "종료",
};

/** What a student should do right now. */
export const STUDENT_TODO: Record<Phase, string> = {
  lobby: "내 생각과 가까운 역할을 1·2순위로 골라요.",
  role: "내 역할 카드를 확인해요.",
  statement: "내 차례에 말하기(Z)를 누르고, 내 역할의 입장을 말해요.",
  event: "사건 카드를 읽고 질문(Z)하거나 답변(X)해요.",
  rebuttal: "곧 투표로 넘어가요.",
  deduce: "누가 역할 전환자 같은지 의견(Z)을 말하거나, 지목받으면 답변(X)해요.",
  vote: "역할 전환자라고 생각하는 사람을 골라요.",
  reveal: "정체와 투표 결과를 확인해요.",
  ended: "게임이 끝났어요. 수고했어요!",
};

// The teacher runs the game from the controls; no per-stage explanation.
export const TEACHER_TODO: Record<Phase, string> = { lobby: "", role: "", statement: "", event: "", rebuttal: "", deduce: "", vote: "", reveal: "", ended: "" };

/** The game's sections, each announced with a full-screen title when it starts. */
export function phaseSection(room: Room): { id: string; title: string; sub?: string } | null {
  if (room.phase === "statement") return room.turn?.stage === "qa" ? { id: "statement-qa", title: "질문하기", sub: "입장 발표에 대해 질문해 주세요" } : { id: "statement", title: "입장 발표하기" };
  if (room.phase === "event") return { id: "event", title: "질문하기", sub: "사건에 대한 질문을 진행해 주세요" };
  if (room.phase === "deduce") return { id: "deduce", title: "최후 추론", sub: "누가 역할 전환자 같은지 이유를 들어 말해 주세요" };
  if (room.phase === "vote") return { id: "vote", title: "투표하기" };
  return null;
}

export const SPEAKING: Phase[] = ["statement", "event", "rebuttal", "deduce"];

/** What the microphone buttons say in each speaking phase. The first is Z, the second X. */
export const MIC_KINDS: Partial<Record<Phase, SpeechKind[]>> = {
  statement: ["statement"],
  event: ["question", "answer"],
  rebuttal: ["rebuttal", "answer"],
  deduce: ["opinion", "answer"],
};

/** The microphone buttons right now: in the Q&A after the statements, anyone can ask or answer. */
export function micKinds(room: Room): SpeechKind[] {
  if (room.phase === "statement" && room.turn?.stage === "qa") return ["question", "answer"];
  return MIC_KINDS[room.phase] ?? [];
}

/** Statements go in turn; the Q&A after them and the event phase are open to anyone. */
export const openFloor = (room: Room) => !room.turn || room.turn.stage === "qa";

export const KIND_LABEL: Record<SpeechKind, string> = { statement: "입장 발표", question: "질문", rebuttal: "반론", answer: "답변", opinion: "의견" };

export const TIMED: Phase[] = ["role", "statement", "event", "rebuttal", "deduce", "vote"];

/** The phases in which the event card is out but, for role switchers, still hidden. */
const EVENT_SECRET: Phase[] = ["event", "rebuttal", "deduce", "vote"];

/** What a role switcher holds instead of the event card. */
export const HIDDEN_EVENT: EventCard = {
  id: "hidden",
  title: "가려진 사건 카드",
  description: "사건 카드가 역할 전환자에게는 보이지 않습니다. 다른 사람의 질문과 답변을 듣고 어떤 사건인지 짐작해 보세요.",
};

/**
 * The event card this screen may show. Until the reveal it lives only in the student's own document
 * (`me.event`) or the teacher's (`host.event`); a role switcher gets none and is shown `HIDDEN_EVENT`.
 */
export function eventFor({ room, me, host }: Pick<Snapshot, "room" | "me" | "host">): { event: EventCard | null; hidden: boolean } {
  const event = room.event ?? me?.event ?? host?.event ?? null;
  const hidden = !event && Boolean(me?.isSwitcher) && EVENT_SECRET.includes(room.phase);
  return { event: hidden ? HIDDEN_EVENT : event, hidden };
}

export const RULES = [
  "선생님이 고른 사회 문제 주제에서, 내 진짜 생각과 가장 가까운 역할을 1순위와 2순위로 골라요.",
  "대부분은 내가 고른 역할 중 하나를 맡아요. 하지만 가장 많이 선택된 1순위 역할을 고른 학생 중 일부는 ‘역할 전환자’가 되어 고르지 않은 역할을 맡아요.",
  "내가 역할 전환자인지는 나만 알아요. 다른 사람의 선택 순위도 아무도 볼 수 없어요.",
  "채팅 없이 직접 말해요. 입장 발표는 순서대로 하고, 내 차례가 오면 말하기 버튼이나 Z를 누르고 말해요.",
  "사건 카드가 공개되면 차례 없이 질문하고 답해요. 질문하고 싶으면 Z, 답하고 싶으면 X를 눌러요. 한 사람이 말하는 동안에는 아무도 마이크를 켤 수 없고, 한 번에 말할 수 있는 시간이 정해져 있어요.",
  "역할 전환자에게는 사건 카드가 보이지 않아요. 다른 사람의 질문과 답변을 듣고 사건을 짐작해 대답해야 해요.",
  "투표 전 최후 추론 시간에는 누가 역할 전환자 같은지, 왜 그렇게 생각하는지 자유롭게 말해요. 의견은 Z, 지목받은 사람의 답변은 X예요.",
  "말한 내용은 내 기기로 녹음해 글로 바꿔요. 입장 발표는 손에 든 카드에, 질문과 답변은 기록에 정리돼요. 음성은 저장하지 않아요. 메모는 내 기기에만 남아요.",
  "마지막에 역할 전환자가 누구인지 추리해 투표해요. 투표가 끝나면 정체와 결과가 공개되고 게임이 끝나요.",
  "화면에 쓰기 전에 욕설이나 사람을 향한 공격이 있는지 확인해요. 걸리면 화면에 나오지 않고 선생님이 살펴봐요. 의견 차이와 반론은 얼마든지 괜찮아요.",
];

export function formatSeconds(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
