// Rule-based reading of the transcript against the 토론·발표 수행평가 rubric.
// It only points at lines worth a look; the teacher makes the call.
import type { ModerationEntry, Participant, Topic, TranscriptLine } from "../../types/game";

export type Level = "met" | "partial" | "weak" | "none";

export const LEVEL_LABEL: Record<Level, string> = { met: "충족", partial: "부분 충족", weak: "보완 필요", none: "근거 없음" };
export const LEVEL_SCORE: Record<Level, number> = { met: 2, partial: 1, weak: 0, none: 0 };

export type CriterionId = "research" | "persuasion" | "acceptance" | "attitude" | "sides" | "speech" | "counter" | "shift" | "verify";
export type GroupId = "points" | "prep" | "record";

export interface Criterion {
  id: CriterionId;
  group: GroupId;
  label: string;
  short: string;
  /** What the rule looks for, shown under the criterion. */
  looksFor: string;
}

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: "points", label: "평가 포인트" },
  { id: "prep", label: "준비 순서" },
  { id: "record", label: "학생부 기록 방향" },
];

export const CRITERIA: Criterion[] = [
  { id: "research", short: "자료", group: "points", label: "자료 조사", looksFor: "수치·통계·기사·사례처럼 근거가 되는 자료를 들어 말했는지" },
  { id: "persuasion", short: "설득", group: "points", label: "발언의 설득력", looksFor: "‘왜냐하면·그래서·따라서’처럼 주장과 이유를 이어 말했는지" },
  { id: "acceptance", short: "수용", group: "points", label: "반론 수용", looksFor: "상대 의견을 먼저 인정한 뒤 자기 생각을 덧붙였는지" },
  { id: "attitude", short: "태도", group: "points", label: "발표 태도", looksFor: "단계마다 고르게 참여하고, 존중하는 말투를 지켰는지" },
  { id: "sides", short: "찬반", group: "prep", label: "쟁점 찬반 근거 수집", looksFor: "내 입장뿐 아니라 다른 역할의 입장·근거도 짚었는지" },
  { id: "speech", short: "발언문", group: "prep", label: "1분 발언문 작성", looksFor: "입장 발표를 충분한 길이로, 짜임새 있게 했는지" },
  { id: "counter", short: "반론", group: "prep", label: "예상 반론 2개 준비", looksFor: "질문에 답하거나 반론을 2번 이상 해냈는지" },
  { id: "shift", short: "관점", group: "record", label: "관점 변화", looksFor: "토론 중 생각이 바뀌거나 넓어졌다고 말했는지" },
  { id: "verify", short: "검증", group: "record", label: "자료 검증 과정", looksFor: "출처·사실 여부를 묻거나 확인하려 했는지" },
];

export interface Finding {
  level: Level;
  reason: string;
  evidence: TranscriptLine[];
  /** The automatic call, kept when the teacher overrides it. */
  autoLevel?: Level;
  comment?: string;
}

export interface StudentReport {
  uid: string;
  nickname: string;
  roleId?: string;
  lines: TranscriptLine[];
  findings: Record<CriterionId, Finding>;
  score: number;
  /** A draft line for the 학생부, built only from what was found. */
  recordDraft: string;
  autoRecordDraft?: string;
}

/** The teacher's corrections to one game's report, per student. */
export type ReportEdits = Record<string, { levels?: Partial<Record<CriterionId, Level>>; comments?: Partial<Record<CriterionId, string>>; record?: string }>;

/** Lay the teacher's corrections over the automatic report; scores and coverage follow. */
export function applyEdits(report: ClassReport, edits: ReportEdits): ClassReport {
  const students = report.students.map((st) => {
    const e = edits[st.uid];
    if (!e) return st;
    const findings = { ...st.findings };
    for (const c of CRITERIA) {
      const level = e.levels?.[c.id];
      const comment = e.comments?.[c.id];
      if (level || comment) findings[c.id] = { ...findings[c.id], ...(level && level !== findings[c.id].level ? { level, autoLevel: findings[c.id].level } : {}), comment };
    }
    const score = CRITERIA.reduce((sum, c) => sum + LEVEL_SCORE[findings[c.id].level], 0);
    return { ...st, findings, score, ...(e.record !== undefined ? { recordDraft: e.record, autoRecordDraft: st.recordDraft } : {}) };
  });
  return { ...report, students, coverage: coverageOf(students) };
}

function coverageOf(students: StudentReport[]): ClassReport["coverage"] {
  return Object.fromEntries(
    CRITERIA.map((c) => [
      c.id,
      {
        met: students.filter((s) => s.findings[c.id].level === "met").length,
        partial: students.filter((s) => s.findings[c.id].level === "partial").length,
        total: students.length,
      },
    ]),
  ) as ClassReport["coverage"];
}

export interface ClassReport {
  students: StudentReport[];
  /** Share of students per criterion who fully met it. */
  coverage: Record<CriterionId, { met: number; partial: number; total: number }>;
  totalLines: number;
}

const has = (text: string, words: RegExp) => words.test(text);

const EVIDENCE = /(\d+(\.\d+)?\s*(%|퍼센트|명|원|개|년|배|건|시간|분|곳|kg|km)|통계|조사|연구|자료|기사|보도|뉴스|설문|에 따르면|실제로|사례|예를 들어|예컨대|실험|보고서|데이터|수치)/;
const REASONING = /(왜냐하면|때문에|그래서|따라서|그러므로|이유는|이유가|첫째|둘째|결론적으로|그렇기에|덕분에|만약|그러면|결국)/;
const ACKNOWLEDGE = /(이해해요|이해합니다|이해는|맞는 말|맞아요|일리|인정|동의|좋은 지적|좋은 질문|말씀처럼|말처럼|공감|그럴 수 있|그 점은)/;
const CONTRAST = /(하지만|그렇지만|그런데|그래도|다만|반면|그러나)/;
const HEDGE = /(음…|음\.\.\.|잘 모르겠|딱 잘라 말하긴|상황에 따라 다를)/;
const POLITE = /(요[.!?…]?\s*$|니다[.!?]?\s*$|요[.!?]|니다[.!?])/;
const SHIFT = /(생각이 바뀌|다시 생각|처음에는|처음엔|듣고 보니|들어 보니|새롭게|알게 됐|알게 되었|생각해 보니|마음이 바뀌|동의하게 됐|입장이 바뀌|넓어졌)/;
const VERIFY = /(출처|사실인지|사실이에요|확인해|확인할|정확한|믿을 수|근거가 뭐|근거는|어디서 나온|진짜인지|검증|팩트)/;
const SIDES = /(장점|단점|반대로|한편|반대 입장|다른 입장|양쪽|두 입장|찬성|반대)/;

const joined = (lines: TranscriptLine[]) => lines.map((l) => l.text).join(" ");
const turns = (lines: TranscriptLine[]) => new Set(lines.map((l) => l.turn)).size;
const pickLines = (lines: TranscriptLine[], test: (l: TranscriptLine) => boolean, max = 4) => lines.filter(test).slice(0, max);

function finding(level: Level, reason: string, evidence: TranscriptLine[] = []): Finding {
  return { level, reason, evidence };
}

function analyse(lines: TranscriptLine[], topic: Topic, roleId: string | undefined, nicknames: string[], flagged: number): Record<CriterionId, Finding> {
  const said = lines.length > 0;
  const silent = finding("none", "기록된 발언이 없어 판단할 수 없어요.");
  const statements = lines.filter((l) => l.phase === "statement");
  const replies = lines.filter((l) => l.kind === "answer" || l.kind === "rebuttal");
  const otherRoles = topic.roles.filter((r) => r.id !== roleId).map((r) => r.name);

  // 자료 조사
  const research = pickLines(lines, (l) => has(l.text, EVIDENCE));
  const researchF = !said
    ? silent
    : research.length >= 2
      ? finding("met", `자료나 수치를 근거로 든 발언이 ${research.length}번 있어요.`, research)
      : research.length === 1
        ? finding("partial", "자료를 근거로 든 발언이 1번 있어요. 한두 번 더 있으면 충족이에요.", research)
        : finding("weak", "수치·기사·사례 같은 자료를 든 발언은 찾지 못했어요.");

  // 설득력
  const reasoned = pickLines(lines, (l) => has(l.text, REASONING));
  const hedged = lines.filter((l) => has(l.text, HEDGE)).length;
  const persuasionF = !said
    ? silent
    : reasoned.length >= 2 && hedged <= reasoned.length / 2
      ? finding("met", `주장과 이유를 이어 말한 발언이 ${reasoned.length}번 있어요.`, reasoned)
      : reasoned.length >= 1
        ? finding("partial", hedged ? `이유를 든 발언이 있지만, 결론을 미룬 말도 ${hedged}번 있어요.` : "이유를 든 발언이 1번 있어요.", reasoned)
        : finding("weak", hedged ? "의견을 분명히 하지 않고 넘긴 발언이 많아요." : "이유와 함께 주장한 발언을 찾지 못했어요.", pickLines(lines, (l) => has(l.text, HEDGE), 2));

  // 반론 수용
  const accepting = pickLines(lines, (l) => has(l.text, ACKNOWLEDGE));
  const balanced = accepting.filter((l) => has(l.text, CONTRAST));
  const acceptanceF = !said
    ? silent
    : balanced.length >= 1
      ? finding("met", "상대 의견을 인정한 뒤 ‘하지만’으로 자기 생각을 이어 갔어요.", accepting)
      : accepting.length >= 1
        ? finding("partial", "상대 의견을 인정하는 말은 있지만, 자기 근거로 이어지지는 않았어요.", accepting)
        : replies.length
          ? finding("weak", "반론·답변은 했지만 상대 의견을 받아들이는 표현은 없었어요.", replies.slice(0, 2))
          : finding("weak", "반론이나 답변 단계의 발언이 없어요.");

  // 발표 태도
  const phases = new Set(lines.map((l) => l.phase)).size;
  const polite = lines.filter((l) => has(l.text, POLITE)).length;
  const attitudeF = !said
    ? silent
    : flagged > 0
      ? finding("weak", `표현 점검에 걸린 발언이 ${flagged}건 있어요. 선생님 확인이 필요해요.`)
      : phases >= 3 && polite >= lines.length / 2
        ? finding("met", "입장 발표·질의응답·반론 세 단계에 모두 참여했고 존중하는 말투를 지켰어요.", lines.slice(0, 3))
        : finding("partial", `${phases}개 단계에 참여했어요.${polite < lines.length / 2 ? " 말끝을 정돈하면 더 좋아요." : ""}`, lines.slice(0, 2));

  // 쟁점 찬반 근거
  const mentionsOther = (t: string) => otherRoles.some((n) => t.includes(n)) || nicknames.some((n) => t.includes(`${n}님`));
  const sides = pickLines(lines, (l) => mentionsOther(l.text) || has(l.text, SIDES));
  const sidesF = !said
    ? silent
    : sides.length >= 2
      ? finding("met", "다른 역할의 입장이나 반대쪽 근거를 함께 짚었어요.", sides)
      : sides.length === 1
        ? finding("partial", "다른 입장을 짚은 발언이 1번 있어요.", sides)
        : finding("weak", "내 역할의 입장만 말했어요. 반대쪽 근거를 짚은 발언은 없었어요.");

  // 1분 발언문
  const speechText = joined(statements);
  const structured = has(speechText, REASONING);
  const speechF = !statements.length
    ? finding(said ? "weak" : "none", said ? "입장 발표 단계의 발언이 기록되지 않았어요." : silent.reason)
    : speechText.length >= 90 && structured
      ? finding("met", `입장 발표가 ${speechText.length}자로 충분하고, 이유를 들어 짜여 있어요.`, statements)
      : speechText.length >= 40
        ? finding("partial", `입장 발표가 ${speechText.length}자예요.${structured ? "" : " 이유를 덧붙이면 더 설득력 있어요."}`, statements)
        : finding("weak", `입장 발표가 ${speechText.length}자로 짧아요. 1분 분량이면 150자 안팎이에요.`, statements);

  // 예상 반론 2개
  const replyTurns = turns(replies);
  const counterF = !said
    ? silent
    : replyTurns >= 2
      ? finding("met", `질문에 답하거나 반론한 차례가 ${replyTurns}번 있어요.`, replies.slice(0, 4))
      : replyTurns === 1
        ? finding("partial", "답변·반론한 차례가 1번 있어요. 2번이면 충족이에요.", replies)
        : finding("weak", "질문에 답하거나 반론한 차례가 없어요.");

  // 관점 변화
  const shifted = pickLines(lines, (l) => has(l.text, SHIFT));
  const shiftF = !said
    ? silent
    : shifted.length
      ? finding("met", "토론 중에 생각이 바뀌었거나 넓어졌다고 말했어요.", shifted)
      : accepting.length
        ? finding("partial", "직접 말하지는 않았지만, 상대 의견을 받아들인 흔적이 있어요.", accepting.slice(0, 2))
        : finding("weak", "관점이 바뀐 흔적은 찾지 못했어요. 토론 후 소감을 따로 받아 보세요.");

  // 자료 검증
  const verified = pickLines(lines, (l) => has(l.text, VERIFY));
  const askedWhy = pickLines(lines, (l) => l.kind === "question" && /(근거|왜|어떻게 알|정말)/.test(l.text), 2);
  const verifyF = !said
    ? silent
    : verified.length
      ? finding("met", "자료의 출처나 사실 여부를 확인하려는 발언이 있어요.", verified)
      : askedWhy.length
        ? finding("partial", "상대 주장의 근거를 물었어요. 출처까지 확인하면 충족이에요.", askedWhy)
        : finding("weak", "출처·사실 확인과 관련된 발언은 없었어요.");

  return {
    research: researchF,
    persuasion: persuasionF,
    acceptance: acceptanceF,
    attitude: attitudeF,
    sides: sidesF,
    speech: speechF,
    counter: counterF,
    shift: shiftF,
    verify: verifyF,
  };
}

function recordDraft(nickname: string, roleName: string, f: Record<CriterionId, Finding>) {
  const parts: string[] = [];
  const met = (id: CriterionId) => f[id].level === "met";
  if (roleName) parts.push(`역할 토론에서 ‘${roleName}’의 입장을 맡아`);
  if (met("research")) parts.push("수치와 사례를 근거로 들며");
  else if (met("persuasion")) parts.push("주장과 이유를 논리적으로 연결하여");
  if (met("speech")) parts.push("짜임새 있는 입장 발표를 하였고,");
  else parts.push("토론에 참여하였고,");
  if (met("acceptance")) parts.push("상대 의견을 존중하며 수용한 뒤 자신의 근거로 반론하는 모습을 보임.");
  else if (met("counter")) parts.push("예상 반론에 적극적으로 답변함.");
  else parts.push("다른 입장의 의견을 경청함.");
  if (met("shift")) parts.push("토론 과정에서 관점이 확장되었음을 스스로 밝힘.");
  if (met("verify")) parts.push("자료의 출처와 사실 여부를 확인하려는 비판적 태도가 돋보임.");
  return parts.join(" ").replace(/\s+/g, " ").trim() || `${nickname}: 기록된 발언이 없어 작성할 내용이 없어요.`;
}

export function buildReport(topic: Topic, participants: Participant[], transcript: TranscriptLine[], moderation: ModerationEntry[] = []): ClassReport {
  const nicknames = participants.map((p) => p.nickname);
  const students = participants.map((p): StudentReport => {
    const lines = transcript.filter((l) => l.uid === p.uid);
    const flagged = moderation.filter((m) => m.uid === p.uid && (m.status === "flagged" || m.status === "returned")).length;
    const findings = analyse(lines, topic, p.roleId, nicknames.filter((n) => n !== p.nickname), flagged);
    const score = CRITERIA.reduce((sum, c) => sum + LEVEL_SCORE[findings[c.id].level], 0);
    const role = topic.roles.find((r) => r.id === p.roleId)?.name ?? "";
    return { uid: p.uid, nickname: p.nickname, roleId: p.roleId, lines, findings, score, recordDraft: lines.length ? recordDraft(p.nickname, role, findings) : "기록된 발언이 없어 작성할 내용이 없어요." };
  });
  const coverage = coverageOf(students);
  return { students, coverage, totalLines: transcript.length };
}

export const MAX_SCORE = CRITERIA.length * 2;
