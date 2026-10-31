import type { MessageKind, Phase } from "../../types/game";

export const PHASE_ORDER: Phase[] = ["lobby", "role", "statement", "event", "rebuttal", "vote", "reveal", "ended"];

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
  lobby: "주제와 규칙을 읽고, 맡고 싶은 역할을 1순위와 2순위로 골라 주세요.",
  role: "나에게만 보이는 역할 카드를 확인해 주세요.",
  statement: "배정받은 역할의 입장에서 주제에 대한 생각을 짧게 발표해 주세요.",
  event: "사건 카드를 읽고, 역할의 입장에서 대응하거나 질문·답변을 주고받아 주세요.",
  rebuttal: "다른 역할의 발언에 반론하거나, 받은 질문에 답해 주세요.",
  vote: "역할 전환자라고 생각하는 사람에게 투표해 주세요.",
  reveal: "역할 전환자의 정체와 투표 결과를 확인해 주세요.",
  ended: "게임이 끝났어요. 참여해 줘서 고마워요!",
};

export const TEACHER_TODO: Record<Phase, string> = {
  lobby: "방 코드나 QR로 학생을 모으고, 모두 역할을 고르면 게임을 시작하세요.",
  role: "학생들이 비밀 역할을 확인하고 있어요. 모두 확인하면 자동으로 넘어가요.",
  statement: "모든 학생이 차례로 입장 발표를 써요. 모두 내거나 시간이 끝나면 함께 공개돼요.",
  event: "사건 카드가 공개됐어요. 학생들이 역할의 입장에서 대응하고 질문·답변을 주고받아요.",
  rebuttal: "반론 단계예요. 상대 역할의 걱정을 짚으며 반론하도록 이끌어 주세요.",
  vote: "학생들이 역할 전환자를 추리해 투표하고 있어요. 모두 투표하면 자동으로 공개돼요.",
  reveal: "역할 전환자의 정체와 투표 결과가 공개됐어요. 결과를 함께 보고 게임을 마치세요.",
  ended: "게임이 끝났어요. 참여 인원과 단계별 제출 현황을 확인하세요.",
};

export const KIND_LABELS: Record<MessageKind, string> = {
  response: "사건 대응",
  question: "질문",
  answer: "답변",
  rebuttal: "반론",
};

export const CHAT_KINDS: Partial<Record<Phase, MessageKind[]>> = {
  event: ["response", "question", "answer"],
  rebuttal: ["rebuttal", "question", "answer"],
};

export const TIMED: Phase[] = ["role", "statement", "event", "rebuttal", "vote"];

export const RULES = [
  "선생님이 고른 사회 문제 주제에서, 맡고 싶은 역할을 1순위와 2순위로 골라요. 이건 내 실제 생각이 아니라 게임에서 맡을 역할이에요.",
  "대부분은 내가 고른 역할 중 하나를 맡아요. 하지만 가장 많이 선택된 1순위 역할을 고른 학생 중 일부는 ‘역할 전환자’가 되어 고르지 않은 역할을 맡아요.",
  "내가 역할 전환자인지는 나만 알아요. 다른 사람의 선택 순위도 아무도 볼 수 없어요.",
  "모두 배정된 역할의 입장에서 발표하고, 사건 카드에 대응하고, 질문·답변·반론을 주고받아요.",
  "마지막에 역할 전환자가 누구인지 추리해 투표해요. 투표가 끝나면 정체와 결과가 공개되고 게임이 끝나요.",
  "공개 전에 욕설이나 사람을 향한 공격이 있는지 확인해요. 걸리면 나에게만 수정 안내가 보여요. 의견 차이와 반론은 얼마든지 괜찮아요.",
];

export function formatSeconds(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
