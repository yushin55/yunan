// Offline practice: one player plus five computer partners, kept in this browser only.
// Mirrors the server's phases, turns and rules; the real game never uses this code.
import topicData from "../../data/practiceTopics.json";
import type { DiscussionSummary, EventCard, HostState, ModerationEntry, Participant, Phase, Room, Snapshot, SpeakingPhase, SpeechKind, Topic, TranscriptLine } from "../../types/game";
import { answerLine, rebuttalLine, responseLine, statementLine } from "./lines";
import { assignRoles, buildReveal, pick, practiceCheck, shuffle, type Assigned } from "./rules";

interface FullTopic extends Topic {
  events: EventCard[];
  teacherGuide: HostState["teacherGuide"];
}
type BotAction = "confirm" | "speak" | "finish" | "vote" | "floor" | "release";

export interface PracticeState {
  version: 4;
  snapshot: Snapshot;
  prefs: Record<string, [string, string]>;
  assigned: Record<string, Assigned>;
  votes: Record<string, string[]>;
  moderation: ModerationEntry[];
  eventCard: EventCard | null;
  seq: number;
  revision: number;
  schedule: { at: number; uid: string; action: BotAction; kind?: SpeechKind; phaseVersion: number; phase?: Phase; left?: number }[];
  /** Who spoke under each phaseVersion, so late words still go to the right person. */
  turnLog: Record<string, { uid: string; phase: SpeakingPhase; kind: SpeechKind }>;
}

export const TOPICS = topicData as FullTopic[];
export const ME = "me";
const BOTS = ["하늘", "도윤", "서연", "지우", "민준"];
const ORDER: Phase[] = ["lobby", "role", "statement", "event", "rebuttal", "vote", "reveal", "ended"];
const TIMED = ["role", "statement", "event", "rebuttal", "vote"];
const MIC_KINDS: Partial<Record<Phase, SpeechKind[]>> = { statement: ["statement"], event: ["question", "answer"], rebuttal: ["rebuttal", "answer"] };
const SECONDS = { role: 30, statement: 30, event: 120, rebuttal: 90, vote: 60 };
const MIC_SECONDS = 30;
// Partners leave room to get a word in, then go quiet so the player is never crowded out.
const BOT_FLOORS = 6;
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
    participantCount: 6, minStudents: 6, maxStudents: 8, topicId: topic.topicId, topic: publicTopic(topic), event: null, turn: null, floor: null,
    settings: { switcherCount: 1, phaseSeconds: SECONDS, micSeconds: MIC_SECONDS }, createdAt: now, endedAt: null,
  };
  return {
    version: 4,
    snapshot: {
      viewer: "student", room,
      participants: seats.map((uid, seat) => participant(uid, name(uid), seat)),
      rounds: { transcript: [] },
      me: { uid: ME, preferences: null, roleId: null, isSwitcher: null, preferenceRank: null, vote: null },
    },
    prefs, assigned: {}, votes: {}, moderation: [], eventCard: null, seq: 0, revision: 0, schedule: [], turnLog: {},
  };
}

const topicOf = (s: PracticeState) => TOPICS.find((t) => t.topicId === s.snapshot.room.topicId)!;

/** Use only the public game state and the teacher's guide in the host preview. */
export function teacherSnapshot(s: PracticeState): Snapshot {
  const { room, participants, rounds } = s.snapshot;
  return { viewer: "host", room, participants, rounds, host: { uid: room.hostUid, teacherGuide: topicOf(s).teacherGuide, moderation: s.moderation } };
}

const roleOf = (s: PracticeState, uid: string) => s.snapshot.room.topic.roles.find((r) => r.id === s.assigned[uid]?.roleId);
const bots = (s: PracticeState) => s.snapshot.participants.map((p) => p.uid).filter((uid) => uid !== ME);
const person = (s: PracticeState, uid: string) => s.snapshot.participants.find((p) => p.uid === uid)!;

function mark(s: PracticeState, uid: string, key: string) {
  const p = person(s, uid);
  if (!p.submitted.includes(key)) p.submitted.push(key);
}

/** The one microphone. On the open floor each speaker gets their own phaseVersion, as on the server. */
function takeFloor(s: PracticeState, uid: string, kind: SpeechKind, now: number) {
  const room = s.snapshot.room;
  if (!room.turn) {
    room.phaseVersion += 1;
    s.turnLog[room.phaseVersion] = { uid, phase: room.phase as SpeakingPhase, kind };
  }
  const endsAt = room.turn ? room.phaseEndsAt! : Math.min(now + room.settings.micSeconds * 1000, room.phaseEndsAt ?? Infinity);
  room.floor = { uid, kind, version: room.phaseVersion, endsAt };
}

/** Partners talk briefly and hand over; the player keeps the turn until they finish or time runs out. */
function planTurn(s: PracticeState, now: number) {
  const room = s.snapshot.room;
  const uid = room.turn!.uid;
  s.turnLog[room.phaseVersion] = { uid, phase: "statement", kind: "statement" };
  if (uid === ME) return;
  takeFloor(s, uid, "statement", now);
  s.schedule.push({ uid, action: "speak", kind: "statement", at: now + between(1, 2), phaseVersion: room.phaseVersion });
  s.schedule.push({ uid, action: "finish", at: now + between(4, 6), phaseVersion: room.phaseVersion });
}

/** Sometime soon, a partner who has something to say goes for the microphone. */
function planFloor(s: PracticeState, at: number, left: number) {
  const room = s.snapshot.room;
  if (left > 0) s.schedule.push({ uid: "", action: "floor", at, phaseVersion: room.phaseVersion, phase: room.phase, left });
}

function startPhase(s: PracticeState, phase: Phase, now: number) {
  const room = s.snapshot.room;
  const seconds = room.settings.phaseSeconds[phase as keyof typeof SECONDS];
  Object.assign(room, { phase, phaseVersion: room.phaseVersion + 1, phaseEndsAt: seconds ? now + seconds * 1000 : null, paused: false, pausedRemainingMs: null, turn: null, floor: null });
  if (phase === "ended") room.endedAt = now;
  const v = room.phaseVersion;
  const plan = (uid: string, action: BotAction, at: number) => s.schedule.push({ uid, action, at: now + at, phaseVersion: v });
  for (const uid of bots(s)) {
    if (phase === "role") plan(uid, "confirm", between(2, 6));
    if (phase === "vote") plan(uid, "vote", between(3, 12));
  }
  if (phase === "statement") {
    const order = s.snapshot.participants.map((p) => p.uid);
    room.turn = { order, index: 0, uid: order[0] };
    planTurn(s, now);
  }
  if (phase === "event" || phase === "rebuttal") planFloor(s, now + between(3, 5), BOT_FLOORS);
}

function nextTurn(s: PracticeState, now: number) {
  const room = s.snapshot.room;
  const turn = room.turn;
  if (!turn || turn.index + 1 >= turn.order.length) return false;
  turn.index += 1;
  turn.uid = turn.order[turn.index];
  Object.assign(room, { phaseVersion: room.phaseVersion + 1, phaseEndsAt: now + room.settings.phaseSeconds[room.phase as keyof typeof SECONDS] * 1000, paused: false, pausedRemainingMs: null, floor: null });
  planTurn(s, now);
  return true;
}

function finishPhase(s: PracticeState, now: number) {
  const room = s.snapshot.room;
  if (room.phase === "role") for (const p of s.snapshot.participants) p.roleId = s.assigned[p.uid].roleId;
  if (room.phase === "statement") room.event = s.eventCard;
  if (room.phase === "vote") s.snapshot.rounds.reveal = buildReveal(s.snapshot.participants.map((p) => p.uid), s.assigned, s.votes, room.settings.switcherCount);
  startPhase(s, ORDER[ORDER.indexOf(room.phase) + 1], now);
}

function transition(s: PracticeState, now: number) {
  if (!nextTurn(s, now)) finishPhase(s, now);
}

function allDone(s: PracticeState) {
  const phase = s.snapshot.room.phase;
  const ps = s.snapshot.participants;
  if (phase === "role") return ps.every((p) => p.submitted.includes("role"));
  if (phase === "vote") return ps.every((p) => p.uid in s.votes);
  return false;
}

function settle(s: PracticeState, now: number) {
  const room = s.snapshot.room;
  if (room.paused || !TIMED.includes(room.phase)) return;
  if ((room.phaseEndsAt && now >= room.phaseEndsAt) || allDone(s)) transition(s, now);
}

function addLine(s: PracticeState, version: number, text: string, source: TranscriptLine["source"], now: number) {
  const { uid, phase, kind } = s.turnLog[version];
  s.seq += 1;
  const id = `m${s.seq}`;
  const line: TranscriptLine = { id, uid, phase, kind, turn: version, text, source, at: now };
  const flagged = uid === ME ? practiceCheck(text) : null;
  if (flagged) {
    s.moderation.push({ ...line, nickname: person(s, uid).nickname, status: "flagged", category: flagged.category, excerpt: flagged.excerpt, verdictSource: "rules" });
    return;
  }
  // Words that arrive after the next speaker started still go back to where they were said.
  const lines = s.snapshot.rounds.transcript;
  const place = lines.findIndex((l) => l.turn > version);
  lines.splice(place < 0 ? lines.length : place, 0, line);
  s.revision += 1;
}

function botLine(s: PracticeState, job: PracticeState["schedule"][number]) {
  const { uid, kind } = job;
  const role = roleOf(s, uid);
  const switcher = s.assigned[uid]?.isSwitcher ?? false;
  const room = s.snapshot.room;
  if (!role) return "";
  if (kind === "statement") return statementLine(role, switcher, rng);
  if (kind === "question") return pick(room.topic.questionPrompts, rng);
  if (kind === "answer") return room.phase === "event" && s.eventCard && rng() < 0.5 ? responseLine(role, s.eventCard, switcher, rng) : answerLine(role, switcher, rng);
  const target = pick(s.snapshot.participants.map((p) => p.uid).filter((u) => u !== uid), rng);
  return rebuttalLine(role, person(s, target).nickname, roleOf(s, target), switcher, rng);
}

/** A partner takes the free microphone: an answer if the last person asked something, otherwise the phase's own kind of speech. */
function runFloor(s: PracticeState, job: PracticeState["schedule"][number], now: number) {
  const room = s.snapshot.room;
  if (room.floor && room.floor.endsAt > now) {
    planFloor(s, now + 1500, job.left!);
    return;
  }
  const previous = s.turnLog[room.phaseVersion];
  const answering = previous?.phase === room.phase && previous.kind !== "answer";
  const kind = answering ? "answer" : MIC_KINDS[room.phase]![0];
  const uid = pick(bots(s).filter((u) => u !== previous?.uid), rng);
  takeFloor(s, uid, kind, now);
  s.schedule.push({ uid, action: "speak", kind, at: now + between(1, 2), phaseVersion: room.phaseVersion });
  s.schedule.push({ uid, action: "release", at: now + between(4, 6), phaseVersion: room.phaseVersion });
  planFloor(s, now + between(8, 13), job.left! - 1);
}

function runBot(s: PracticeState, job: PracticeState["schedule"][number], now: number) {
  const { uid } = job;
  const switcher = s.assigned[uid]?.isSwitcher ?? false;
  if (job.action === "confirm") mark(s, uid, "role");
  if (job.action === "speak") {
    const text = botLine(s, job);
    if (text) addLine(s, job.phaseVersion, text, "voice", now);
  }
  if (job.action === "finish") transition(s, now);
  if (job.action === "release" && s.snapshot.room.floor?.uid === uid) s.snapshot.room.floor = null;
  if (job.action === "floor") runFloor(s, job, now);
  if (job.action === "vote") {
    const others = s.snapshot.participants.map((p) => p.uid).filter((u) => u !== uid);
    const switchers = others.filter((u) => s.assigned[u].isSwitcher);
    // Partners are decent but not perfect detectives.
    const target = !switcher && switchers.length && rng() < 0.55 ? pick(switchers, rng) : pick(others, rng);
    s.votes[uid] = [target];
    mark(s, uid, "vote");
  }
}

/** A simple stand-in for the AI summary: each role's latest words, without any judgement. */
function localSummary(s: PracticeState): DiscussionSummary {
  const lines = s.snapshot.rounds.transcript;
  const roles = new Map<string, string[]>();
  const short = (text: string) => (text.length > 60 ? `${text.slice(0, 60)}…` : text);
  for (const line of lines) {
    const roleId = person(s, line.uid).roleId;
    if (roleId) roles.set(roleId, [...(roles.get(roleId) ?? []), short(line.text)].slice(-2));
  }
  const questions = lines.filter((l) => l.kind === "question").map((l) => short(l.text));
  const statements = s.snapshot.participants.flatMap((p) => {
    const said = lines.filter((l) => l.uid === p.uid && l.kind === "statement").map((l) => l.text);
    return said.length ? [{ uid: p.uid, text: short(said.join(" ")) }] : [];
  });
  return { positions: [...roles].map(([roleId, points]) => ({ roleId, points: [...new Set(points)] })), clashes: [], questions: [...new Set(questions)].slice(-3), statements, source: "local", revision: s.revision, at: Date.now() };
}

/** Advance time: run partner actions that are due, then check the phase deadline. */
export function tick(state: PracticeState, now = Date.now()): PracticeState | null {
  const room = state.snapshot.room;
  if (room.paused) return null;
  const due = state.schedule.filter((j) => j.at <= now);
  const expired = room.phaseEndsAt !== null && now >= room.phaseEndsAt;
  if (!due.length && !expired) return null;
  const s = structuredClone(state);
  s.schedule = s.schedule.filter((j) => j.at > now);
  for (const job of due.sort((a, b) => a.at - b.at)) {
    const current = s.snapshot.room;
    // Words already spoken still get written down; everything else is for the moment it was planned for.
    const timely = job.action === "speak" ? current.phase === s.turnLog[job.phaseVersion]?.phase : job.action === "floor" ? current.phase === job.phase : current.phaseVersion === job.phaseVersion;
    if (timely) runBot(s, job, now);
  }
  settle(s, now);
  return s;
}

export class PracticeError extends Error {}

/** The player's (and the stand-in teacher's) actions. Mirrors the server's checks. */
export function act(state: PracticeState, name: string, body: Record<string, unknown>, now = Date.now()): { state: PracticeState } {
  const s = structuredClone(state);
  const room = s.snapshot.room;
  const me = s.snapshot.me!;
  const fail = (message: string): never => {
    throw new PracticeError(message);
  };
  // Scheduled delays are stored relative while paused, so partners resume at the same pace.
  const unpauseJobs = () => {
    if (room.paused) for (const job of s.schedule) job.at += now;
  };
  const stale = body.phaseVersion !== undefined && body.phaseVersion !== room.phaseVersion;
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
  if (name === "pause" || name === "resume" || name === "extend") {
    if (!TIMED.includes(room.phase)) fail("지금은 시간을 조작할 수 없는 단계예요.");
    if (name === "pause" && !room.paused) {
      room.pausedRemainingMs = Math.max(0, (room.phaseEndsAt ?? now) - now);
      room.phaseEndsAt = null;
      room.paused = true;
      room.floor = null;
      for (const job of s.schedule) job.at -= now;
    } else if (name === "resume" && room.paused) {
      room.phaseEndsAt = now + (room.pausedRemainingMs ?? 0);
      room.pausedRemainingMs = null;
      room.paused = false;
      for (const job of s.schedule) job.at += now;
    } else if (name === "extend") {
      const seconds = Number(body.seconds);
      if (!Number.isFinite(seconds) || seconds < 10 || seconds > 300) fail("연장 시간은 10~300초로 정해 주세요.");
      if (room.paused) room.pausedRemainingMs = (room.pausedRemainingMs ?? 0) + seconds * 1000;
      else room.phaseEndsAt = (room.phaseEndsAt ?? now) + seconds * 1000;
      if (room.turn && room.floor) room.floor.endsAt = room.phaseEndsAt!;
    }
    return { state: s };
  }
  if (name === "end") {
    if (room.phase === "reveal") startPhase(s, "ended", now);
    return { state: s };
  }
  if (name === "next") {
    if (stale) return { state: s };
    unpauseJobs();
    if (room.phase === "reveal") startPhase(s, "ended", now);
    else if (room.phase !== "lobby" && room.phase !== "ended") transition(s, now);
    return { state: s };
  }
  if (name === "skip-phase") {
    if (stale) return { state: s };
    if (!TIMED.includes(room.phase)) fail("지금은 다음 단계로 넘길 수 없어요.");
    unpauseJobs();
    finishPhase(s, now);
    return { state: s };
  }
  if (name === "speaker") {
    const turn = room.turn;
    const target = String(body.targetUid);
    if (!turn) return fail("차례대로 말하는 단계에서만 차례를 줄 수 있어요.");
    if (stale || target === turn.uid) return { state: s };
    unpauseJobs();
    turn.order = [...turn.order.slice(0, turn.index + 1), target, ...turn.order.slice(turn.index + 1).filter((u) => u !== target)];
    nextTurn(s, now);
    return { state: s };
  }
  if (name === "line-add") {
    const version = body.phaseVersion === undefined ? room.phaseVersion : Number(body.phaseVersion);
    if (!s.turnLog[version]) fail("지금 말하는 사람이 없어요.");
    addLine(s, version, String(body.text ?? "").trim(), "typed", now);
    return { state: s };
  }
  if (name === "line-edit" || name === "line-delete") {
    const lines = s.snapshot.rounds.transcript;
    const line = lines.find((l) => l.id === body.lineId);
    if (!line) return fail("이미 지운 발언이에요.");
    if (name === "line-edit") line.text = String(body.text).trim();
    else lines.splice(lines.indexOf(line), 1);
    s.revision += 1;
    return { state: s };
  }
  if (name === "summary") {
    if (s.snapshot.rounds.transcript.length && s.snapshot.rounds.summary?.revision !== s.revision) s.snapshot.rounds.summary = localSummary(s);
    return { state: s };
  }
  if (name === "mic-off") {
    if (room.floor?.uid === ME && !stale) room.floor = null;
    return { state: s };
  }
  if (room.paused) fail("선생님이 진행을 잠시 멈췄어요.");
  if (name === "mic-on") {
    const kind = body.kind as SpeechKind;
    if (!MIC_KINDS[room.phase]?.includes(kind)) fail("지금은 이 버튼으로 마이크를 켤 수 없어요.");
    if (room.floor && room.floor.endsAt > now) {
      if (room.floor.uid === ME && room.floor.kind === kind) return { state: s };
      fail(`${person(s, room.floor.uid).nickname}님이 말하고 있어요. 끝나면 마이크를 켤 수 있어요.`);
    }
    if (room.turn && room.turn.uid !== ME) fail("내 차례가 오면 마이크를 켤 수 있어요.");
    takeFloor(s, ME, kind, now);
    return { state: s };
  }
  if (name === "confirm-role") {
    if (room.phase === "role") mark(s, ME, "role");
    settle(s, now);
    return { state: s };
  }
  if (name === "end-turn") {
    if (room.turn?.uid === ME && !stale) transition(s, now);
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
  return { state: s };
}

/** What the player "said" in a fast-forwarded preview: one line per speaking phase, written from their role card. */
function previewLine(s: PracticeState, phase: SpeakingPhase) {
  const strip = (t: string) => t.replace(/[.。]\s*$/, "");
  const role = roleOf(s, ME);
  const other = s.snapshot.room.topic.roles.find((r) => r.id !== role?.id);
  if (!role) return "";
  if (phase === "statement")
    return `저는 ${role.name}입니다. 최근 기사에 따르면 이 문제로 불편을 겪는 학생이 30% 정도라고 해요. 왜냐하면 ‘${strip(role.concerns[0])}’라는 문제가 있기 때문이에요. 그래서 ‘${strip(role.goal)}’ 쪽으로 정해야 한다고 생각합니다.`;
  if (phase === "event") return "방금 나온 자료는 출처가 어디인가요? 사실인지 먼저 확인해 보고 이야기하면 좋겠어요.";
  return `${other?.name ?? "상대"}의 걱정은 이해해요. 하지만 실제로 다른 학교 사례를 보면 ‘${strip(role.concerns[role.concerns.length > 1 ? 1 : 0])}’라는 점이 더 컸어요. 처음에는 한쪽만 생각했는데, 듣고 보니 두 입장을 함께 봐야겠다고 생각이 바뀌었어요.`;
}

/**
 * A fresh practice game already moved on to `phase`, for previewing one step of the teacher screen.
 * The phases before it are played out on a fast clock, so partners really speak and the player
 * gets a sample line in each speaking phase; before the vote ends everyone casts a random vote.
 * Finally every clock is shifted so the target phase starts now.
 */
export function createPracticeAt(nickname: string, topicId: string | null, phase: Phase, now = Date.now()): PracticeState {
  let s = createPractice(nickname, topicId, now);
  if (phase === "lobby") return s;
  let t = now;
  const roles = s.snapshot.room.topic.roles.map((r) => r.id);
  s = act(s, "preferences", { first: roles[0], second: roles[1] }, t).state;
  s = act(s, "start", {}, t).state;
  const spoke = new Set<number>();
  for (let guard = 0; guard < 5000 && s.snapshot.room.phase !== phase && s.snapshot.room.phase !== "ended"; guard++) {
    const room = s.snapshot.room;
    const say = (kind: SpeechKind) => {
      s = act(s, "mic-on", { kind }, t).state;
      s = act(s, "line-add", { text: previewLine(s, room.phase as SpeakingPhase), phaseVersion: s.snapshot.room.phaseVersion }, t).state;
    };
    if (room.phase === "vote") {
      const uids = s.snapshot.participants.map((p) => p.uid);
      for (const uid of uids) s.votes[uid] = shuffle(uids.filter((u) => u !== uid), rng).slice(0, room.settings.switcherCount);
      s.snapshot.me!.vote = s.votes[ME];
      for (const p of s.snapshot.participants) if (!p.submitted.includes("vote")) p.submitted.push("vote");
      // With every vote in, settling moves on to the reveal by itself.
      s = act(s, "sync", {}, t).state;
      continue;
    }
    if (room.phase === "reveal") {
      s = act(s, "next", {}, t).state;
      continue;
    }
    if (room.phase === "role") {
      s = act(s, "skip-phase", {}, t).state;
      continue;
    }
    if (room.phase === "statement" && room.turn?.uid === ME && !spoke.has(room.phaseVersion)) {
      spoke.add(room.phaseVersion);
      say("statement");
      s = act(s, "end-turn", {}, t).state;
      continue;
    }
    if ((room.phase === "event" || room.phase === "rebuttal") && !spoke.has(-ORDER.indexOf(room.phase)) && !(room.floor && room.floor.endsAt > t)) {
      spoke.add(-ORDER.indexOf(room.phase));
      say(room.phase === "event" ? "question" : "rebuttal");
      s = act(s, "mic-off", {}, t).state;
      continue;
    }
    // Jump the clock to whatever happens next: a partner's move or the deadline.
    const next = Math.min(...s.schedule.map((j) => j.at), room.phaseEndsAt ?? Infinity);
    t = Number.isFinite(next) ? Math.max(t, next) : t + 1000;
    s = tick(s, t) ?? s;
  }
  // Shift the fast clock back to real time.
  const shift = now - t;
  const room = s.snapshot.room;
  if (room.phaseEndsAt !== null) room.phaseEndsAt += shift;
  if (room.floor) room.floor.endsAt += shift;
  if (room.endedAt) room.endedAt = now;
  for (const job of s.schedule) job.at += shift;
  for (const line of s.snapshot.rounds.transcript) line.at += shift;
  return s;
}
