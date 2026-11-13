import type { Phase, Room, SpeechKind } from "../../types/game";

// No rebuttal: questions and answers run longer instead. "rebuttal" stays in `Phase` only for old records.
export const PHASE_ORDER: Phase[] = ["lobby", "role", "statement", "event", "vote", "reveal", "ended"];

export const PHASE_LABELS: Record<Phase, string> = {
  lobby: "대기실",
  role: "비밀 역할 확인",
  statement: "입장 발표",
  event: "사건 공개 · 질문과 답변",
  rebuttal: "반론",
  vote: "역할 전환자 투표",
  reveal: "정체 · 투표 결과 공개",
  ended: "게임 종료",
};

export const PHASE_SHORT: Record<Phase, string> = {
  lobby: "대기실",
  role: "역할 확인",
  statement: "입장 발표",
  event: "사건·질문",
  rebuttal: "반론",
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
  vote: "역할 전환자라고 생각하는 사람을 골라요.",
  reveal: "정체와 투표 결과를 확인해요.",
  ended: "게임이 끝났어요. 수고했어요!",
};

export const TEACHER_TODO: Record<Phase, string> = {
  lobby: "학생을 모으고, 모두 역할을 고르면 시작하세요.",
  role: "학생들이 역할을 확인 중이에요. 모두 확인하면 넘어가요.",
  statement: "차례대로 발표해요. 이름을 누르면 바로 차례를 줄 수 있어요.",
  event: "사건 카드를 읽어 주세요. 이제 자유롭게 질문하고 답해요.",
  rebuttal: "바로 투표로 넘어가요.",
  vote: "학생들이 투표 중이에요. 시간이 끝나면 공개돼요.",
  reveal: "결과를 함께 보고 게임을 마치세요.",
  ended: "게임이 끝났어요.",
};

/** The game's sections, each announced with a full-screen title when it starts. */
export function phaseSection(room: Room): { id: string; title: string; sub?: string } | null {
  if (room.phase === "statement") return room.turn?.stage === "qa" ? { id: "statement-qa", title: "질문", sub: "입장 발표가 끝났어요" } : { id: "statement", title: "입장 발표" };
  if (room.phase === "event") return { id: "event", title: "질문", sub: "사건이 일어났어요" };
  if (room.phase === "vote") return { id: "vote", title: "투표" };
  return null;
}

export const SPEAKING: Phase[] = ["statement", "event", "rebuttal"];

/** What the microphone buttons say in each speaking phase. The first is Z, the second X. */
export const MIC_KINDS: Partial<Record<Phase, SpeechKind[]>> = {
  statement: ["statement"],
  event: ["question", "answer"],
  rebuttal: ["rebuttal", "answer"],
};

/** The microphone buttons right now: in the Q&A after the statements, anyone can ask or answer. */
export function micKinds(room: Room): SpeechKind[] {
  if (room.phase === "statement" && room.turn?.stage === "qa") return ["question", "answer"];
  return MIC_KINDS[room.phase] ?? [];
}

/** Statements go in turn; the Q&A after them and the event phase are open to anyone. */
export const openFloor = (room: Room) => !room.turn || room.turn.stage === "qa";

export const KIND_LABEL: Record<SpeechKind, string> = { statement: "입장 발표", question: "질문", rebuttal: "반론", answer: "답변" };

export const TIMED: Phase[] = ["role", "statement", "event", "rebuttal", "vote"];

export const RULES = [
  "선생님이 고른 사회 문제 주제에서, 내 진짜 생각과 가장 가까운 역할을 1순위와 2순위로 골라요.",
  "대부분은 내가 고른 역할 중 하나를 맡아요. 하지만 가장 많이 선택된 1순위 역할을 고른 학생 중 일부는 ‘역할 전환자’가 되어 고르지 않은 역할을 맡아요.",
  "내가 역할 전환자인지는 나만 알아요. 다른 사람의 선택 순위도 아무도 볼 수 없어요.",
  "채팅 없이 직접 말해요. 입장 발표는 순서대로 하고, 내 차례가 오면 말하기 버튼이나 Z를 누르고 말해요.",
  "사건 카드가 공개되면 차례 없이 질문하고 답해요. 질문하고 싶으면 Z, 답하고 싶으면 X를 눌러요. 한 사람이 말하는 동안에는 아무도 마이크를 켤 수 없고, 한 번에 말할 수 있는 시간이 정해져 있어요.",
  "말한 내용은 내 기기로 녹음해 글로 바꿔요. 입장 발표는 손에 든 카드에, 질문과 답변은 기록에 정리돼요. 음성은 저장하지 않아요. 메모는 내 기기에만 남아요.",
  "마지막에 역할 전환자가 누구인지 추리해 투표해요. 투표가 끝나면 정체와 결과가 공개되고 게임이 끝나요.",
  "화면에 쓰기 전에 욕설이나 사람을 향한 공격이 있는지 확인해요. 걸리면 화면에 나오지 않고 선생님이 살펴봐요. 의견 차이와 반론은 얼마든지 괜찮아요.",
];

export function formatSeconds(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
