// Offline practice: one player plus five computer partners, kept in this browser only.
// Mirrors the server's phases and rules; the real game never uses this code.
import topicData from "../../data/practiceTopics.json";
import type { ChatMessage, EventCard, MessageKind, ModerationResult, Participant, Phase, Room, Snapshot, StatementRow, Topic } from "../../types/game";
import { answerLine, rebuttalLine, responseLine, statementLine } from "./lines";
import { assignRoles, buildReveal, pick, practiceCheck, shuffle, type Assigned } from "./rules";

interface FullTopic extends Topic {
  events: EventCard[];
}
type BotAction = "confirm" | "statement" | "response" | "question" | "answer" | "rebuttal" | "vote";

export interface PracticeState {
  version: 2;
  snapshot: Snapshot;
  prefs: Record<string, [string, string]>;
  assigned: Record<string, Assigned>;
  votes: Record<string, string[]>;
  statements: Record<string, StatementRow>;
  eventCard: EventCard | null;
  seq: number;
  schedule: { at: number; uid: string; action: BotAction; targetUid?: string; phaseVersion: number }[];
}

export const TOPICS = topicData as FullTopic[];
export const ME = "me";
const BOTS = ["하늘", "도윤", "서연", "지우", "민준"];
const ORDER: Phase[] = ["lobby", "role", "statement", "event", "rebuttal", "vote", "reveal", "ended"];
const SECONDS = { role: 30, statement: 90, event: 150, rebuttal: 120, vote: 60 };
const rng = Math.random;
const between = (min: number, max: number) => Math.round((min + rng() * (max - min)) * 1000);

function publicTopic(t: FullTopic): Topic {
  return { topicId: t.topicId, title: t.title, shortTitle: t.shortTitle, situation: t.situation, version: t.version, isHypothetical: t.isHypothetical, roles: t.roles, questionPrompts: t.questionPrompts, briefing: t.briefing };
}

export function createPractice(nickname: string, topicId: string | null, now = Date.now()): PracticeState {
  const topic = TOPICS.find((t) => t.topicId === topicId) ?? pick(TOPICS, rng);
  const roleIds = topic.roles.map((r) => r.id);
  const participant = (uid: string, name: string, seat: number): Participant => ({ uid, nickname: name, seat, joinedAt: now, connectedAt: now, prefsDone: uid !== ME, submitted: [] });
  const seats = shuffle([ME, ...BOTS.map((_, i) => `bot${i}`)], rng);
  const name = (uid: string) => (uid === ME ? nickname : BOTS[Number(uid.slice(3))]);
  const prefs: Record<string, [string, string]> = {};
  for (const uid of seats) if (uid !== ME) prefs[uid] = shuffle(roleIds, rng).slice(0, 2) as [string, string];
  const room: Room = {
    roomId: "practice", code: "연습", hostUid: "practice-teacher", phase: "lobby", phaseVersion: 0, phaseEndsAt: null, paused: false, pausedRemainingMs: null,
    participantCount: 6, minStudents: 6, maxStudents: 8, topicId: topic.topicId, topic: publicTopic(topic), event: null,
    settings: { switcherCount: 1, phaseSeconds: SECONDS }, createdAt: now, endedAt: null,
  };
  return {
    version: 2,
    snapshot: {
      viewer: "student", room,
      participants: seats.map((uid, seat) => participant(uid, name(uid), seat)),
      rounds: { statements: [], chat: [] },
      me: { uid: ME, preferences: null, roleId: null, isSwitcher: null, preferenceRank: null, vote: null, notices: [] },
    },
    prefs, assigned: {}, votes: {}, statements: {}, eventCard: null, seq: 0, schedule: [],
  };
}

const topicOf = (s: PracticeState) => TOPICS.find((t) => t.topicId === s.snapshot.room.topicId)!;
const roleOf = (s: PracticeState, uid: string) => s.snapshot.room.topic.roles.find((r) => r.id === s.assigned[uid]?.roleId);
const bots = (s: PracticeState) => s.snapshot.participants.map((p) => p.uid).filter((uid) => uid !== ME);
const person = (s: PracticeState, uid: string) => s.snapshot.participants.find((p) => p.uid === uid)!;

function mark(s: PracticeState, uid: string, key: string) {
  const p = person(s, uid);
  if (!p.submitted.includes(key)) p.submitted.push(key);
}

function startPhase(s: PracticeState, phase: Phase, now: number) {
  const room = s.snapshot.room;
  const seconds = SECONDS[phase as keyof typeof SECONDS];
  Object.assign(room, { phase, phaseVersion: room.phaseVersion + 1, phaseEndsAt: seconds ? now + seconds * 1000 : null });
  if (phase === "ended") room.endedAt = now;
  const v = room.phaseVersion;
  const plan = (uid: string, action: BotAction, at: number, targetUid?: string) => s.schedule.push({ uid, action, at: now + at, targetUid, phaseVersion: v });
  const others = (uid: string) => s.snapshot.participants.map((p) => p.uid).filter((u) => u !== uid);
  for (const uid of bots(s)) {
    if (phase === "role") plan(uid, "confirm", between(2, 6));
    if (phase === "statement") plan(uid, "statement", between(6, 25));
    if (phase === "event") plan(uid, "response", between(5, 40));
    if (phase === "rebuttal") plan(uid, "rebuttal", between(6, 55), pick(others(uid), rng));
    if (phase === "vote") plan(uid, "vote", between(3, 12));
  }
  if (phase === "event")
    for (const uid of shuffle(bots(s), rng).slice(0, 3)) plan(uid, "question", between(30, 90), rng() < 0.5 ? ME : pick(others(uid), rng));
}

function transition(s: PracticeState, now: number) {
  const room = s.snapshot.room;
  if (room.phase === "role") for (const p of s.snapshot.participants) p.roleId = s.assigned[p.uid].roleId;
  if (room.phase === "statement") {
    s.snapshot.rounds.statements = s.snapshot.participants.map((p) => s.statements[p.uid] ?? { uid: p.uid, timedOut: true });
    room.event = s.eventCard;
  }
  if (room.phase === "vote") {
    s.snapshot.rounds.reveal = buildReveal(s.snapshot.participants.map((p) => p.uid), s.assigned, s.votes, room.settings.switcherCount);
  }
  startPhase(s, ORDER[ORDER.indexOf(room.phase) + 1], now);
}

function allDone(s: PracticeState) {
  const phase = s.snapshot.room.phase;
  const ps = s.snapshot.participants;
  if (phase === "role") return ps.every((p) => p.submitted.includes("role"));
  if (phase === "statement") return ps.every((p) => p.uid in s.statements);
  if (phase === "vote") return ps.every((p) => p.uid in s.votes);
  return false;
}

function settle(s: PracticeState, now: number) {
  const room = s.snapshot.room;
  if (!["role", "statement", "event", "rebuttal", "vote"].includes(room.phase)) return;
  if ((room.phaseEndsAt && now >= room.phaseEndsAt) || allDone(s)) transition(s, now);
}

function post(s: PracticeState, uid: string, kind: MessageKind, text: string, now: number, targetUid?: string) {
  s.seq += 1;
  const message: ChatMessage = { id: `m${s.seq}`, uid, phase: s.snapshot.room.phase as "event" | "rebuttal", kind, text, targetUid: targetUid ?? null, at: now };
  s.snapshot.rounds.chat.push(message);
  // Someone asked a partner a question: the partner answers shortly.
  if (kind === "question" && targetUid && targetUid !== ME)
    s.schedule.push({ uid: targetUid, action: "answer", at: now + between(5, 10), targetUid: uid, phaseVersion: s.snapshot.room.phaseVersion });
}

function runBot(s: PracticeState, job: PracticeState["schedule"][number], now: number) {
  const { uid } = job;
  const role = roleOf(s, uid);
  const switcher = s.assigned[uid]?.isSwitcher ?? false;
  if (job.action === "confirm") mark(s, uid, "role");
  if (job.action === "statement" && role) {
    s.statements[uid] = { uid, text: statementLine(role, switcher, rng), at: now };
    mark(s, uid, "statement");
  }
  if (job.action === "response" && role && s.eventCard) post(s, uid, "response", responseLine(role, s.eventCard, switcher, rng), now);
  if (job.action === "question") post(s, uid, "question", pick(s.snapshot.room.topic.questionPrompts, rng), now, job.targetUid);
  if (job.action === "answer" && role) post(s, uid, "answer", answerLine(role, switcher, rng), now, job.targetUid);
  if (job.action === "rebuttal" && role && job.targetUid)
    post(s, uid, "rebuttal", rebuttalLine(role, person(s, job.targetUid).nickname, roleOf(s, job.targetUid), switcher, rng), now, job.targetUid);
  if (job.action === "vote") {
    const others = s.snapshot.participants.map((p) => p.uid).filter((u) => u !== uid);
    const switchers = others.filter((u) => s.assigned[u].isSwitcher);
    // Partners are decent but not perfect detectives.
    const target = !switcher && switchers.length && rng() < 0.55 ? pick(switchers, rng) : pick(others, rng);
    s.votes[uid] = [target];
    mark(s, uid, "vote");
  }
}

/** Advance time: run partner actions that are due, then check the phase deadline. */
export function tick(state: PracticeState, now = Date.now()): PracticeState | null {
  const room = state.snapshot.room;
  const due = state.schedule.filter((j) => j.at <= now);
  const expired = room.phaseEndsAt !== null && now >= room.phaseEndsAt;
  if (!due.length && !expired) return null;
  const s = structuredClone(state);
  s.schedule = s.schedule.filter((j) => j.at > now);
  for (const job of due.sort((a, b) => a.at - b.at)) if (job.phaseVersion === s.snapshot.room.phaseVersion) runBot(s, job, now);
  settle(s, now);
  return s;
}

export class PracticeError extends Error {}

/** The player's (and the stand-in teacher's) actions. Mirrors the server's checks. */
export function act(state: PracticeState, name: string, body: Record<string, unknown>, now = Date.now()): { state: PracticeState; moderation?: ModerationResult } {
  const s = structuredClone(state);
  const room = s.snapshot.room;
  const me = s.snapshot.me!;
  const fail = (message: string): never => {
    throw new PracticeError(message);
  };
  settle(s, now);
  if (name === "sync") return { state: s };
  if (name === "preferences") {
    if (room.phase !== "lobby") fail("게임이 시작되어 선호 역할을 바꿀 수 없어요.");
    me.preferences = { first: String(body.first), second: String(body.second) };
    s.prefs[ME] = [me.preferences.first, me.preferences.second];
    person(s, ME).prefsDone = true;
    return { state: s };
  }
  if (name === "start") {
    if (room.phase !== "lobby") return { state: s };
    if (!me.preferences) fail("먼저 선호 역할을 골라 주세요.");
    s.assigned = assignRoles(room.topic.roles.map((r) => r.id), s.prefs, room.settings.switcherCount, rng);
    Object.assign(me, { roleId: s.assigned[ME].roleId, isSwitcher: s.assigned[ME].isSwitcher, preferenceRank: s.assigned[ME].preferenceRank });
    s.eventCard = pick(topicOf(s).events, rng);
    startPhase(s, "role", now);
    return { state: s };
  }
  if (name === "next") {
    if (room.phase === "reveal") startPhase(s, "ended", now);
    else if (room.phase !== "lobby" && room.phase !== "ended") transition(s, now);
    return { state: s };
  }
  if (name === "confirm-role") {
    if (room.phase === "role") mark(s, ME, "role");
    settle(s, now);
    return { state: s };
  }
  if (name === "vote") {
    if (room.phase !== "vote") fail("투표 시간이 아니에요.");
    const targets = body.targets as string[];
    if (targets.includes(ME)) fail("자기 자신에게는 투표할 수 없어요.");
    s.votes[ME] = targets;
    me.vote = targets;
    mark(s, ME, "vote");
    settle(s, now);
    return { state: s };
  }
  if (name === "statement" || name === "messages") {
    const text = String(body.text ?? "").trim();
    const kind = (name === "statement" ? "statement" : body.kind) as MessageKind | "statement";
    if (name === "statement" && room.phase !== "statement") fail("입장 발표 시간이 끝났어요.");
    if (name === "messages" && room.phase !== "event" && room.phase !== "rebuttal") fail("지금은 채팅으로 발언하는 단계가 아니에요.");
    s.seq += 1;
    const id = `m${s.seq}`;
    const flagged = practiceCheck(text);
    if (flagged) {
      me.notices.push({ id, kind, phase: room.phase, status: "needs_edit", hint: flagged.hint, excerpt: flagged.excerpt, text, targetUid: (body.targetUid as string) ?? null, at: now });
      return { state: s, moderation: { status: "needs_edit", messageId: id, hint: flagged.hint, excerpt: flagged.excerpt } };
    }
    if (name === "statement") {
      s.statements[ME] = { uid: ME, text, at: now };
      mark(s, ME, "statement");
      settle(s, now);
    } else {
      s.seq -= 1; // post() assigns the id
      post(s, ME, kind as MessageKind, text, now, (body.targetUid as string) || undefined);
    }
    return { state: s, moderation: { status: "published", messageId: id } };
  }
  return { state: s };
}
