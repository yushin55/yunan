import type { Phase, SpeechKind } from "../../types/game";

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
  statement: "내 차례가 오면 말하기 버튼이나 Z를 누르고, 배정받은 역할의 입장에서 주제에 대한 생각을 말해 주세요.",
  event: "사건 카드를 읽고, 질문이 있으면 질문 버튼이나 Z, 답하고 싶으면 답변 버튼이나 X를 누르고 말해 주세요.",
  rebuttal: "다른 역할의 말에 반론하려면 반론 버튼이나 Z, 질문에 답하려면 답변 버튼이나 X를 누르고 말해 주세요.",
  vote: "역할 전환자라고 생각하는 사람에게 투표해 주세요.",
  reveal: "역할 전환자의 정체와 투표 결과를 확인해 주세요.",
  ended: "게임이 끝났어요. 참여해 줘서 고마워요!",
};

export const TEACHER_TODO: Record<Phase, string> = {
  lobby: "방 코드나 QR로 학생을 모으고, 모두 역할을 고르면 게임을 시작하세요.",
  role: "학생들이 비밀 역할을 확인하고 있어요. 모두 확인하면 자동으로 넘어가요.",
  statement: "학생이 차례대로 자기 기기의 마이크를 켜고 말해요. 시간이 끝나면 자동으로 넘어가고, 이름을 누르면 바로 차례를 줄 수 있어요.",
  event: "사건 카드를 읽어 주세요. 이제 차례 없이, 학생이 마이크를 켜서 질문하고 답해요. 한 번에 한 명만 켤 수 있어요.",
  rebuttal: "상대 역할의 걱정을 짚으며 반론하도록 이끌어 주세요. 학생이 마이크를 켜서 반론하고 답해요. 말한 내용은 아래에 정리돼요.",
  vote: "학생들이 역할 전환자를 추리해 투표하고 있어요. 모두 투표하면 자동으로 공개돼요.",
  reveal: "역할 전환자의 정체와 투표 결과가 공개됐어요. 결과를 함께 보고 게임을 마치세요.",
  ended: "게임이 끝났어요. 참여 인원과 단계별 제출 현황을 확인하세요.",
};

export const SPEAKING: Phase[] = ["statement", "event", "rebuttal"];

/** What the microphone buttons say in each speaking phase. The first is Z, the second X. */
export const MIC_KINDS: Partial<Record<Phase, SpeechKind[]>> = {
  statement: ["statement"],
  event: ["question", "answer"],
  rebuttal: ["rebuttal", "answer"],
};

export const KIND_LABEL: Record<SpeechKind, string> = { statement: "입장 발표", question: "질문", rebuttal: "반론", answer: "답변" };

export const TIMED: Phase[] = ["role", "statement", "event", "rebuttal", "vote"];

export const RULES = [
  "선생님이 고른 사회 문제 주제에서, 맡고 싶은 역할을 1순위와 2순위로 골라요. 이건 내 실제 생각이 아니라 게임에서 맡을 역할이에요.",
  "대부분은 내가 고른 역할 중 하나를 맡아요. 하지만 가장 많이 선택된 1순위 역할을 고른 학생 중 일부는 ‘역할 전환자’가 되어 고르지 않은 역할을 맡아요.",
  "내가 역할 전환자인지는 나만 알아요. 다른 사람의 선택 순위도 아무도 볼 수 없어요.",
  "채팅 없이 직접 말해요. 입장 발표는 순서대로 하고, 내 차례가 오면 말하기 버튼이나 Z를 누르고 말해요.",
  "사건 카드가 공개되면 차례 없이 질문하고 답해요. 질문하고 싶으면 Z, 답하고 싶으면 X를 눌러요. 다음 단계의 반론도 마찬가지예요. 한 사람이 말하는 동안에는 아무도 마이크를 켤 수 없고, 한 번에 말할 수 있는 시간이 정해져 있어요.",
  "말한 내용은 내 기기로 녹음해 글로 바꿔요. 입장 발표는 손에 든 카드에, 질문과 답변은 기록에 정리돼요. 음성은 저장하지 않아요. 메모는 내 기기에만 남아요.",
  "마지막에 역할 전환자가 누구인지 추리해 투표해요. 투표가 끝나면 정체와 결과가 공개되고 게임이 끝나요.",
  "화면에 쓰기 전에 욕설이나 사람을 향한 공격이 있는지 확인해요. 걸리면 화면에 나오지 않고 선생님이 살펴봐요. 의견 차이와 반론은 얼마든지 괜찮아요.",
];

export function formatSeconds(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
