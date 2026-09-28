import topicData from "../data/topics.json";
import { PHASES, REVIEW_PHASES } from "../types/game";
import type {
  Phase,
  Snapshot,
  Topic,
  Position,
  Reflection,
  Submission,
  Breakdown,
  Reaction,
  ReactionKind,
} from "../types/game";
const topics = topicData as Topic[];
const KEY = "yunan.practice.v1";
const durations: Partial<Record<Phase, number>> = {
  topic: 45,
  initial: 75,
  role: 45,
  claim: 45,
  claim_review: 40,
  scenario: 90,
  scenario_review: 45,
  question: 90,
  guess: 45,
  reveal: 120,
  reflection: 90,
};
interface PracticeState {
  snapshot: Snapshot;
  actions: Record<string, Record<string, unknown>>;
  ratings: string[];
}
let state: PracticeState | null = null;
function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
export function createPractice(nickname = "나") {
  state = {
    snapshot: {
      room: {
        roomId: "practice",
        code: "연습 모드",
        hostUid: "you",
        phase: "lobby",
        phaseVersion: 0,
        phaseEndsAt: null,
        participantCount: 4,
      },
      participants: [
        { uid: "you", nickname, ready: true, submitted: [] },
        { uid: "bot-1", nickname: "모카", ready: true, submitted: [] },
        { uid: "bot-2", nickname: "올리브", ready: true, submitted: [] },
        { uid: "bot-3", nickname: "루카", ready: true, submitted: [] },
      ],
      me: { uid: "you" },
      rounds: {},
    },
    actions: {},
    ratings: [],
  };
  save();
  return state.snapshot;
}
export function loadPractice() {
  if (!state) {
    try {
      state = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      state = null;
    }
  }
  return state?.snapshot || createPractice();
}
function assign() {
  const s = state!.snapshot;
  const roles = s.room.topic!.roles;
  const prefs = s.me.preferences || roles.slice(0, 2).map((r) => r.id);
  const role = roles.find((r) => !prefs.includes(r.id))!;
  s.me.roleId = role.id;
  s.me.isSwitcher = true;
  s.me.cards = role.cards;
  s.participants[0].roleId = role.id;
  s.participants.slice(1).forEach((p, i) => (p.roleId = roles[i].id));
}
function results() {
  const s = state!.snapshot;
  const a = state!.actions;
  const connection = String(
    a.claim?.cardConnection || a.scenario?.cardConnection || "",
  ).trim();
  const claim = !!a.claim;
  const scenario = !!a.scenario;
  const question = !!a.question || !!a.answer;
  const guess = !!a.guess?.reason;
  const reflect = !!a.reflection?.opinion;
  const breakdown: Breakdown[] = [
    {
      label: "입장 선언",
      points: claim ? 10 : 0,
      max: 10,
      reason: "입장 선언을 제출하면 10점",
    },
    {
      label: "사건 대응",
      points: scenario ? 10 : 0,
      max: 10,
      reason: "선택과 이유를 제출하면 10점",
    },
    {
      label: "교차 질문 참여",
      points: question ? 10 : 0,
      max: 10,
      reason: "질문 또는 답변 참여 10점",
    },
    {
      label: "관점 카드 연결",
      points: connection ? 5 : 0,
      max: 15,
      reason: "카드와 연결 설명 작성 5점. 나머지 10점은 실제 참가자 근거 활용 평가로 부여",
    },
    {
      label: "이유 있는 추리",
      points: guess ? (a.guess?.targetUid === "bot-2" ? 10 : 5) : 0,
      max: 10,
      reason: "이유와 단서 제출 5점 + 전환자를 맞히면 5점",
    },
    {
      label: "참가자 평가",
      points: 0,
      max: 25,
      reason: "연습 캐릭터는 사람의 평가를 대신하지 않아 0점",
    },
    {
      label: "진짜 목소리",
      points: reflect ? 15 : 0,
      max: 15,
      reason: "실제 의견 작성 15점. 의견 변화는 점수와 무관",
    },
    {
      label: "역할 수행 보너스",
      points: 0,
      max: 5,
      reason: "연습에서는 실제 참가자의 추리를 받지 않음",
    },
  ];
  const me = {
    uid: "you",
    nickname: s.participants[0].nickname,
    total: breakdown.reduce((n, b) => n + b.points, 0),
    breakdown,
    guessCorrect: a.guess?.targetUid === "bot-2",
    initialPosition: s.me.initialPosition,
    reflection: s.me.reflection,
  };
  s.results = { players: [me], me };
}
/** Practice characters react to your turn and to each other a few seconds apart. */
function botReactions(round: "claim" | "scenario"): Reaction[] {
  const s = state!.snapshot;
  const bots = s.participants.slice(1);
  const now = Date.now();
  const toYou: ReactionKind[] = round === "claim" ? ["convincing", "curious", "rebut"] : ["agree", "rebut", "convincing"];
  const rows: Reaction[] = bots.map((bot, i) => ({ uid: bot.uid, targetUid: "you", round, kind: toYou[i % toYou.length], at: now + 2500 + i * 2600 }));
  bots.forEach((bot, i) => {
    const target = bots[(i + 1) % bots.length];
    rows.push({ uid: bot.uid, targetUid: target.uid, round, kind: i % 2 ? "agree" : "curious", at: now + 1200 + i * 3100 });
  });
  return rows;
}
function advance() {
  const s = state!.snapshot;
  const phase = PHASES[PHASES.indexOf(s.room.phase) + 1];
  if (!phase) return;
  if (phase === "role") assign();
  if (phase === "reveal")
    s.rounds.reveal = s.participants.map((p, i) => ({
      uid: p.uid,
      roleId: p.roleId!,
      isSwitcher: i === 0 || i === 2,
    }));
  if (phase === "results") results();
  const review = REVIEW_PHASES[phase];
  if (review) {
    s.rounds.reactions = [...(s.rounds.reactions || []), ...botReactions(review)];
    s.participants.slice(1).forEach((p) => p.submitted.push(phase));
  }
  s.room.phase = phase;
  s.room.phaseVersion++;
  s.room.phaseEndsAt = durations[phase]
    ? Date.now() + durations[phase]! * 1000
    : null;
}
function botSubmissions(kind: "claim" | "scenario"): Submission[] {
  const s = state!.snapshot;
  return s.participants.slice(1).map((p, i) => {
    const role = s.room.topic!.roles.find((r) => r.id === p.roleId)!;
    return {
      uid: p.uid,
      text: kind === "claim" ? `${role.priority}을 우선해야 합니다. ${role.goal}`.slice(0, 100) : undefined,
      optionId: kind === "scenario" ?
        s.room.topic!.scenario.options[
          i % s.room.topic!.scenario.options.length
        ].id : undefined,
      reason: kind === "scenario" ? role.cards[0].text.slice(0, 100) : undefined,
      cardId: role.cards[0].id,
      cardConnection: kind === "claim" ? role.cards[0].title : undefined,
    };
  });
}
export function practiceAction(
  action: string,
  body: Record<string, unknown> = {},
): Snapshot {
  loadPractice();
  const s = state!.snapshot;
  if (action === "start") {
    const previous = localStorage.getItem("yunan.lastPracticeTopic");
    const available = topics.filter((t) => t.topicId !== previous);
    s.room.topic = available[Math.floor(Math.random() * available.length)];
    s.room.topicId = s.room.topic.topicId;
    s.room.topicVersion = s.room.topic.version;
    localStorage.setItem("yunan.lastPracticeTopic", s.room.topicId);
    advance();
  } else if (action === "sync") {
    if (s.room.phaseEndsAt && Date.now() >= s.room.phaseEndsAt) advance();
  } else if (action === "next") {
    advance();
  } else if (action === "ready") {
    s.participants[0].ready = Boolean(body.ready);
  } else if (action === "report") {
    return structuredClone(s);
  } else if (action === "react") {
    const round = REVIEW_PHASES[s.room.phase];
    if (round) {
      const target = String(body.targetUid);
      const rest = (s.rounds.reactions || []).filter((r) => !(r.uid === "you" && r.targetUid === target && r.round === round));
      s.rounds.reactions = body.kind ? [...rest, { uid: "you", targetUid: target, round, kind: body.kind as ReactionKind, at: Date.now() }] : rest;
    }
  } else if (action === "review-done") {
    if (REVIEW_PHASES[s.room.phase]) advance();
  } else {
    state!.actions[action] = body;
    s.participants[0].submitted.push(s.room.phase);
    if (action === "initial-position") {
      s.me.initialPosition = {
        position: body.position as Position,
        reason: String(body.reason),
        preferences: body.preferences as string[],
      };
      s.me.preferences = body.preferences as string[];
      advance();
    }
    if (action === "claim" || action === "scenario") {
      s.rounds[action] = [{ uid: "you", ...body }, ...botSubmissions(action)];
      advance();
    }
    if (action === "question") {
      s.rounds.question = [
        {
          uid: "you",
          questionId: "q-you",
          targetUid: String(body.targetUid),
          text: String(body.text),
          answer: "그 우려를 반영한 예외 기준과 재검토 절차를 마련하겠습니다.",
        },
        {
          uid: "bot-1",
          questionId: "q-bot",
          targetUid: "you",
          text: s.room.topic!.questions[0],
        },
      ];
    }
    if (action === "answer") {
      const q = s.rounds.question?.find(
        (q) => q.questionId === body.questionId,
      );
      if (q) q.answer = String(body.text);
    }
    if (action === "guess") {
      s.me.guess = body as typeof s.me.guess;
      advance();
    }
    if (action === "rating") {
      if (!state!.ratings.includes(String(body.targetUid)))
        state!.ratings.push(String(body.targetUid));
      s.me.ratedTargets = [...state!.ratings];
      if (state!.ratings.length >= 3) advance();
    }
    if (action === "reflection") {
      s.me.reflection = body as unknown as Reflection;
      if (body.share)
        s.rounds.sharedReflections = [
          { uid: "you", opinion: String(body.opinion) },
        ];
      advance();
    }
  }
  save();
  return structuredClone(s);
}
