import { useEffect, useRef, useState } from "react";
import type { Intro, IntroStep, Participant, Role, Room, Rounds } from "../types/game";
import IssueBriefing from "../features/briefing/IssueBriefing";
import RulesVideo from "../features/briefing/RulesVideo";
import { introElapsed, introKey } from "../features/briefing/intro";
import PhaseBanner from "../components/PhaseBanner";
import RoleAvatar from "../features/roles/RoleAvatar";
import { lobbyStepKey } from "./StudentRoomPage";
import { usePhaseTimer } from "../features/game/usePhaseTimer";
import EventCard from "../components/EventCard";
import Tabs from "../components/Tabs";
import { useFloor } from "../features/discussion/floor";
import SpeakerStage from "../features/discussion/SpeakerStage";
import { useAutoSummary } from "../features/discussion/useAutoSummary";
import { eventFor, PHASE_LABELS, PHASE_ORDER, PHASE_SHORT, SPEAKING, TIMED } from "../features/game/phases";
import TableView from "../features/game/TableView";
import { allReady, StartCountdown, useAutoStart } from "../features/game/useAutoStart";
import IntroControl, { NEXT } from "../features/teacher/IntroControl";
import RoomCode from "../features/room/RoomCode";
import type { RoomApi } from "../features/room/useRoom";
import DiscussionRecord from "../features/teacher/DiscussionRecord";
import LobbySettings from "../features/teacher/LobbySettings";
import ModerationPanel from "../features/teacher/ModerationPanel";
import ParticipationBoard, { GameSummary, ParticipationGrid } from "../features/teacher/ParticipationBoard";
import PhaseMemo, { usePhaseNotes } from "../features/teacher/PhaseMemo";
import RunBar from "../features/teacher/RunBar";
import TeacherReport from "../features/teacher/TeacherReport";
import TeacherSidebar, { useSidebar } from "../features/teacher/TeacherSidebar";
import { countNotes, gameKey, loadDebate, saveDebate } from "../features/teacher/teacherStorage";
import TopicPicker from "../features/topics/TopicPicker";
import PauseOverlay from "../components/PauseOverlay";
import { useTopics } from "../features/topics/useTopics";
import { RevealSummary } from "../features/voting/RevealView";

function useServerNow(offset: number) {
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 2000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

type LobbyView = "join" | "intro" | "setup";
type DoneView = "result" | "report" | "record";
const INTRO_LABEL = { waiting: "대기", briefing: "이슈 브리핑", rules: "게임 규칙", roles: "역할 고르기" } as const;

/**
 * The teacher's screen, made to fit one window. The bar on top runs the game (phase, what to do,
 * clock, buttons) and switches between sections; the area below shows one section at a time, and
 * long lists scroll inside their own panel. Notes live in a sidebar on the right edge.
 * `startIn` comes from the practice page, which starts the game itself; a real room starts from here.
 */
export default function TeacherRoomPage({ api, practice = false, barControls, startIn }: { api: RoomApi; practice?: boolean; barControls?: React.ReactNode; startIn?: number | null }) {
  const { state, action, quiet, busy, error, offset, online } = api;
  const { room, participants, rounds } = state!;
  const host = state!.host!;
  const { catalog } = useTopics(!practice);
  const [changingTopic, setChangingTopic] = useState(false);
  const [present, setPresent] = useState(false);
  const [lobbyView, setLobbyView] = useState<LobbyView>("join");
  const [doneView, setDoneView] = useState<DoneView>("result");
  // Practice rooms have no `intro`: the preview walks through the same steps on this screen alone.
  const [localIntro, setLocalIntro] = useState<Intro>({ step: "waiting", startedAt: null });
  const intro = room.intro ?? localIntro;
  const stepIntro = (step: IntroStep) => (room.intro ? void action("intro", { step }) : setLocalIntro({ step, startedAt: Date.now() + offset }));
  // A seek, scene jump, skip or pause on the teacher's video: the students' videos go to the same second.
  // One request at a time, and only the latest of any that pile up, so the class ends where the teacher did.
  const moves = useRef<{ queue: Promise<unknown>; latest: number }>({ queue: Promise.resolve(), latest: 0 });
  const moveIntro = (at: number, paused: boolean) => {
    if (!room.intro) {
      setLocalIntro((cur) => ({ ...cur, startedAt: Date.now() + offset - at * 1000, pausedAt: paused ? at : null, run: cur.run ?? cur.startedAt ?? undefined }));
      return;
    }
    const id = ++moves.current.latest;
    const step = intro.step;
    moves.current.queue = moves.current.queue.then(() => (id === moves.current.latest ? action("intro", { step, at, paused }) : null));
  };
  const [sideOpen, setSideOpen] = useSidebar();
  const serverNow = useServerNow(offset);
  const phase = room.phase;
  const speaking = SPEAKING.includes(phase);
  const { event } = eventFor(state!);
  const turn = room.turn;
  const { floor, seconds: floorSeconds } = useFloor(room, offset);
  const speaker = participants.find((p) => p.uid === (floor?.uid ?? turn?.uid));
  const upcoming = turn && turn.index + 1 < turn.order.length ? participants.find((p) => p.uid === turn.order[turn.index + 1]) : undefined;
  const toReview = host.moderation.filter((e) => e.status === "flagged" || e.status === "pending_review").length;
  // Keeps the one-line statement summaries coming.
  useAutoSummary(rounds.transcript, () => quiet("summary"));
  const next = PHASE_ORDER[PHASE_ORDER.indexOf(phase) + 1];
  const count = participants.length;
  const waiting = participants.filter((p) => !p.prefsDone).length;
  const blockers = [
    count < room.minStudents && `학생이 ${room.minStudents}명 이상 필요해요 (지금 ${count}명)`,
    count > room.maxStudents && `학생은 최대 ${room.maxStudents}명이에요`,
    room.intro && room.intro.step !== "roles" && "영상을 마치고 ‘역할 고르기 시작’을 눌러 주세요",
    waiting > 0 && `${waiting}명이 아직 선호 역할을 고르는 중이에요`,
  ].filter(Boolean) as string[];
  const autoLeft = useAutoStart(!practice && allReady(room, participants), () => void action("start"));
  const countdown = practice ? (startIn ?? null) : autoLeft;
  // The classroom screen is the game alone, full screen. Leaving full screen (Esc) closes it too.
  const openPresent = () => {
    setPresent(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const closePresent = () => {
    setPresent(false);
    if (document.fullscreenElement) void document.exitFullscreen();
  };
  useEffect(() => {
    const change = () => !document.fullscreenElement && setPresent(false);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const key = gameKey(room.roomId, room.createdAt);
  const { notes, addNote, removeNote } = usePhaseNotes(key);
  const finished = phase === "reveal" || phase === "ended";
  // Keep the finished game (and later edits or notes) in this browser's debate history.
  useEffect(() => {
    if (!finished) return;
    saveDebate({
      key,
      roomId: room.roomId,
      roomCode: room.code,
      topic: room.topic,
      createdAt: room.createdAt,
      // Until the teacher ends the game, keep the time the result was first shown.
      endedAt: room.endedAt ?? loadDebate(key)?.endedAt ?? Date.now(),
      practice,
      participants,
      transcript: rounds.transcript,
      moderation: host.moderation,
      reveal: rounds.reveal,
      summary: rounds.summary,
      settings: room.settings,
      notes,
    });
  }, [finished, key, room.code, room.topic, room.createdAt, room.endedAt, room.settings, practice, participants, rounds.transcript, rounds.reveal, rounds.summary, host.moderation, notes]);

  const roster = (
    <section className="panel roster-panel" data-testid="participation-panel">
      <h3>참여 현황</h3>
      <ParticipationGrid
        room={room}
        participants={participants}
        rounds={rounds}
        serverNow={practice ? room.createdAt : serverNow}
        speakingUid={floor?.uid ?? (turn?.stage !== "qa" ? turn?.uid : undefined)}
        floor={floor}
        floorSeconds={floorSeconds}
        alwaysOnline={practice}
      />
    </section>
  );
  const record = <DiscussionRecord room={room} participants={participants} rounds={rounds} floor={floor} speakingUid={speaker?.uid} busy={busy} action={action} />;

  // Section tabs: before the game and after it there is more than fits one screen.
  const tabs =
    phase === "lobby" ? (
      <Tabs<LobbyView>
        label="대기실 화면"
        variant="line"
        active={lobbyView}
        onChange={setLobbyView}
        items={[
          { id: "join", label: `학생 입장 ${count}명` },
          { id: "intro", label: `시작 전 영상 · ${INTRO_LABEL[intro.step]}` },
          { id: "setup", label: "주제와 설정" },
        ]}
      />
    ) : finished ? (
      <Tabs<DoneView>
        label="결과 화면"
        variant="line"
        active={doneView}
        onChange={setDoneView}
        items={[
          { id: "result", label: "결과와 참여" },
          { id: "report", label: "수행평가 레포트" },
          { id: "record", label: `토론 기록 ${rounds.transcript.length}` },
        ]}
      />
    ) : null;

  return (
    <main className={`teacher-room${present ? " present" : ""}`}>
      {present && <ClassScreen room={room} participants={participants} rounds={rounds} offset={offset} onClose={closePresent} busy={busy} onIntroStep={stepIntro} />}
      <StartCountdown left={countdown} />
      <div className="teacher-chrome">
        <header className="teacher-top">
          <span className="brand-mark">
            whose side<span>?</span>
          </span>
          <span className="topic-chip" title={room.topic.title}>
            {room.topic.title}
          </span>
          {!practice && (
            <span className="code-chip">
              방 코드 <strong>{room.code}</strong>
            </span>
          )}
          {toReview > 0 && (
            <button className="teacher-attention" data-testid="review-badge" title="메모 사이드바에서 확인하기" onClick={() => setSideOpen(true)}>
              확인할 발언 {toReview}
            </button>
          )}
          <span className="bar-spacer" />
          {barControls && <div className="teacher-practice-controls">{barControls}</div>}
          <button className="button ghost small" data-testid="present-toggle" onClick={openPresent}>
            교실 화면 띄우기
          </button>
          <span className={`net ${online ? "on" : "off"}`} role="status">
            {online ? "연결됨" : "연결 끊김"}
          </span>
        </header>

        <RunBar room={room} offset={offset} hideTimer={Boolean(turn)} notice={phase === "lobby" ? blockers : undefined}>
          {phase === "lobby" ? (
            <button className="button primary" data-testid="start-game" disabled={busy || blockers.length > 0} onClick={() => void action("start")}>
              게임 시작
            </button>
          ) : (
            phase !== "ended" && (
              <>
                {TIMED.includes(phase) &&
                  (room.paused ? (
                    <button className="button ghost" disabled={busy} onClick={() => void action("resume")}>
                      재개
                    </button>
                  ) : (
                    <button className="button ghost" disabled={busy} onClick={() => void action("pause")}>
                      일시정지
                    </button>
                  ))}
                {TIMED.includes(phase) && (
                  <button className="button ghost" disabled={busy} onClick={() => void action("extend", { seconds: 60 })}>
                    1분 연장
                  </button>
                )}
                {phase === "event" && room.reading && (
                  <>
                    <span className="reading-count" data-testid="reading-count">
                      사건 카드 읽는 중 {participants.filter((p) => p.submitted.includes("event")).length}/{count}명
                    </span>
                    <button className="button ghost" data-testid="open-questions" disabled={busy} onClick={() => void action("open-questions")}>
                      기다리지 않고 질문 시작
                    </button>
                  </>
                )}
                {turn && (
                  <button className="button ghost" data-testid="next-phase" disabled={busy} onClick={() => void action("skip-phase", { phaseVersion: room.phaseVersion })}>
                    발표 건너뛰고 {PHASE_SHORT[next]}
                  </button>
                )}
                {turn ? (
                  <button className="button primary" data-testid="next-turn" disabled={busy} onClick={() => void action("next", { phaseVersion: room.phaseVersion })}>
                    {upcoming ? `다음 차례: ${upcoming.nickname}` : `다음 단계: ${PHASE_SHORT[next]}`}
                  </button>
                ) : phase === "reveal" ? (
                  <button className="button primary" disabled={busy} onClick={() => void action("end")}>
                    게임 종료
                  </button>
                ) : (
                  <button className="button primary" data-testid="next-phase" disabled={busy} onClick={() => void action("next", { phaseVersion: room.phaseVersion })}>
                    다음 단계: {PHASE_SHORT[next]}
                  </button>
                )}
              </>
            )
          )}
        </RunBar>
        {tabs && <nav className="view-bar">{tabs}</nav>}
      </div>

      <div className={`teacher-body${sideOpen ? " side-open" : ""}`}>
        <div className="teacher-view">
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}

          {phase === "lobby" && lobbyView === "join" && (
            <section className="panel view-fill lobby-join">
              <div className="panel-head">
                <h3>학생 입장</h3>
                <span className="muted small">
                  {count}명 들어옴 · {room.minStudents}~{room.maxStudents}명
                </span>
              </div>
              <div className="lobby-join-body">
                {practice ? <p className="muted small lobby-join-note">연습 방이에요.</p> : <RoomCode code={room.code} large />}
                <div className="lobby-join-list">
                  <ParticipationBoard
                    room={room}
                    rounds={rounds}
                    alwaysOnline={practice}
                    floor={floor}
                    floorSeconds={floorSeconds}
                    participants={participants}
                    serverNow={practice ? room.createdAt : serverNow}
                    busy={busy}
                    onKick={!practice ? (uid) => void action("kick", { targetUid: uid }) : undefined}
                  />
                </div>
              </div>
            </section>
          )}

          {phase === "lobby" && lobbyView === "intro" && (
            <IntroControl intro={intro} room={room} participants={participants} offset={offset} busy={busy} onStep={stepIntro} onMove={moveIntro} preview={!room.intro} hideVideo={present} />
          )}

          {phase === "lobby" && lobbyView === "setup" && (
            <div className="view-split">
              <section className="panel view-fill scroll">
                <div className="panel-head">
                  <h3>주제</h3>
                  <button className="button ghost small" disabled={practice} onClick={() => setChangingTopic((v) => !v)}>
                    {changingTopic ? "닫기" : "주제 바꾸기"}
                  </button>
                </div>
                <h4 className="topic-title">{room.topic.title}</h4>
                <p>{room.topic.situation}</p>
                <p className="muted small">역할: {room.topic.roles.map((r) => r.name).join(" · ")}</p>
                {changingTopic && catalog && (
                  <>
                    <p className="banner warn">주제를 바꾸면 학생들이 선호 역할을 다시 골라야 해요.</p>
                    <TopicPicker
                      topics={catalog.topics}
                      selected={room.topicId}
                      disabled={busy}
                      onSelect={(topicId) => void action("settings", { topicId }).then(() => setChangingTopic(false))}
                      onRandom={() => void action("settings", { randomTopic: true }).then(() => setChangingTopic(false))}
                    />
                  </>
                )}
              </section>
              <section className="panel view-fill scroll">
                <h3>진행 설정</h3>
                {(catalog || practice) && (
                  <fieldset disabled={practice} className="practice-settings-preview">
                    <LobbySettings
                      key={JSON.stringify(room.settings)}
                      settings={room.settings}
                      students={Math.max(count, room.minStudents)}
                      range={catalog?.config.phaseSecondsRange ?? { min: 20, max: 900 }}
                      busy={busy}
                      onSave={(settings) => void action("settings", settings as unknown as Record<string, unknown>)}
                    />
                  </fieldset>
                )}
              </section>
            </div>
          )}

          {phase !== "lobby" && !finished && (
            <div className="live-board">
              <div className="live-left">
                {speaking && (
                  <section className="panel stage-panel">
                    <SpeakerStage room={room} participants={participants} offset={offset} busy={busy} onCall={(uid) => void action("speaker", { targetUid: uid, phaseVersion: room.phaseVersion })} />
                  </section>
                )}
                {event && (phase === "event" || phase === "deduce") && (
                  <>
                    <EventCard event={event} collapsible defaultOpen={false} />
                    <p className="muted small event-secret-note">역할 전환자에게는 사건 카드가 보이지 않아요. 소리 내어 읽거나 교실 화면에 띄우지 마세요.</p>
                  </>
                )}
                {roster}
              </div>
              {record}
            </div>
          )}

          {finished && doneView === "result" && (
            <div className="view-split">
              <div className="view-column">
                {rounds.reveal && (
                  <section className="panel result-panel" data-testid="reveal-side">
                    <h3>결과</h3>
                    <RevealSummary reveal={rounds.reveal} participants={participants} topic={room.topic} />
                  </section>
                )}
                {phase === "ended" && <GameSummary participants={participants} rounds={rounds} />}
              </div>
              {roster}
            </div>
          )}
          {finished && doneView === "report" && (
            <TeacherReport fill topic={room.topic} participants={participants} transcript={rounds.transcript} moderation={host.moderation} notes={notes} at={room.endedAt ?? undefined} editKey={key} roomId={practice ? undefined : room.roomId} />
          )}
          {finished && doneView === "record" && record}
        </div>

        <TeacherSidebar open={sideOpen} onOpenChange={setSideOpen} count={countNotes(notes)} attention={toReview}>
          <PhaseMemo phase={phase} notes={notes} participants={participants} onAdd={addNote} onRemove={removeNote} />
          <ModerationPanel host={host} busy={busy || practice} onReview={(entryId, decision) => void action("review", { entryId, decision })} />
        </TeacherSidebar>
      </div>
    </main>
  );
}

/**
 * What the class sees on the projector, made for students who are watching rather than playing:
 * the table and whose turn it is, the roles and who plays them, and at the end the result with the
 * event card. Only public game information, never the teacher's own panels: the event card is not
 * public until the reveal, since role switchers play without it.
 */
function ClassScreen({ room, participants, rounds, offset, onClose, busy, onIntroStep }: { room: Room; participants: Participant[]; rounds: Rounds; offset: number; onClose: () => void; busy: boolean; onIntroStep: (step: IntroStep) => void }) {
  const timer = usePhaseTimer(room, offset);
  const reveal = (room.phase === "reveal" || room.phase === "ended") && rounds.reveal;
  const intro = room.phase === "lobby" ? room.intro : null;
  // The same step the students are on: the teacher's in a real room, the player's own in practice.
  const step = room.phase !== "lobby" ? null : intro ? intro.step : (["briefing", "rules", "roles"] as const)[practiceStep(room)];
  const lobbyVideo = step === "briefing" || step === "rules";
  const title = step ? { waiting: room.topic.title, briefing: "이슈 브리핑", rules: "게임 규칙", roles: "역할 고르기" }[step] : PHASE_LABELS[room.phase];
  const next = intro ? NEXT[intro.step] : null;
  return (
    <div className="class-screen" data-testid="class-screen">
      <PhaseBanner room={room} offset={offset} />
      <header className="class-screen-top">
        <strong>{title}</strong>
        {timer.label && !room.reading && <span className="bar-timer">{timer.label}</span>}
        <span className="class-screen-topic">{room.topic.shortTitle}</span>
        <span className="bar-spacer" />
        {next && (
          <button className="button primary small" data-testid="class-intro-next" disabled={busy} onClick={() => onIntroStep(next.step)}>
            {next.label}
          </button>
        )}
        <button className="button ghost small" onClick={onClose}>
          교실 화면 닫기
        </button>
      </header>
      {lobbyVideo ? (
        <div className="class-screen-video">
          <IntroVideos room={room} offset={offset} step={step} />
        </div>
      ) : room.phase === "lobby" ? (
        <div className="class-screen-roles-full">
          <h2>{room.topic.title}</h2>
          <RoleCards roles={room.topic.roles} />
        </div>
      ) : (
        <>
          {SPEAKING.includes(room.phase) && <SpeakerStage room={room} participants={participants} offset={offset} />}
          <div className="class-screen-body">
            <div className="class-screen-table">
              <TableView room={room} participants={participants} rounds={rounds} offset={offset} overview />
              {room.paused && <PauseOverlay />}
              {/* The card itself is only on each student's own screen: a role switcher may be watching this one. */}
              {room.reading && (
                <section className="class-screen-event" data-testid="class-event">
                  <p className="class-screen-reading">사건 카드는 각자 화면에서만 볼 수 있어요. 역할 전환자에게는 보이지 않아요.</p>
                  <p className="class-screen-reading">
                    사건 카드를 읽는 중이에요 · {participants.filter((p) => p.submitted.includes("event")).length}/{participants.length}명
                  </p>
                </section>
              )}
              {reveal && (
                <section className="panel class-screen-result">
                  <RevealSummary reveal={reveal} participants={participants} topic={room.topic} />
                </section>
              )}
            </div>
            <aside className="class-screen-side" aria-label="역할과 사건">
              {room.event && !room.reading && <EventCard event={room.event} />}
              <RoleList room={room} participants={participants} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/** The role cards the students pick from, the same look without the picking: for the class to read along. */
function RoleCards({ roles }: { roles: Role[] }) {
  return (
    <div className="role-cards class-role-cards" data-testid="class-role-cards">
      {roles.map((role, i) => (
        <article key={role.id} className="role-tap">
          <RoleAvatar name={role.name} index={i} />
          <strong>{role.name}</strong>
          <span className="role-tap-goal">{role.goal}</span>
          <ul className="role-tap-worries">
            {role.concerns.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

/** A practice player's own pre-game step (0 briefing, 1 rules, 2 roles); see the student screen. */
function practiceStep(room: Room) {
  try {
    return Math.min(2, Math.max(0, Number(sessionStorage.getItem(lobbyStepKey(room))) || 0));
  } catch {
    return 0;
  }
}

/** Every role in this topic: what it wants, what it worries about, and (once roles are dealt) who plays it. */
function RoleList({ room, participants }: { room: Room; participants: Participant[] }) {
  return (
    <ul className="class-roles" data-testid="class-roles">
      {room.topic.roles.map((role, i) => {
        const players = participants.filter((p) => p.roleId === role.id);
        return (
          <li key={role.id} className="class-role">
            <RoleAvatar name={role.name} index={i} />
            <div>
              <h3>
                {role.name}
                {players.length > 0 && <span className="class-role-players">{players.map((p) => p.nickname).join(", ")}</span>}
              </h3>
              <p className="class-role-goal">{role.goal}</p>
              <ul className="class-role-worries">
                {role.concerns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The briefing or the rules video: in step with every student in a real room, freely in practice. */
function IntroVideos({ room, offset = 0, step }: { room: Room; offset?: number; step?: IntroStep | null }) {
  const led = room.intro;
  const at = led ? introElapsed(led, offset) : undefined;
  // Like the students' players: restart wherever the teacher seeks or pauses.
  const key = led ? introKey(led) : room.topicId;
  const paused = led?.pausedAt != null;
  if (step === "briefing") return <IssueBriefing key={key} briefing={room.topic.briefing} topicId={room.topicId} headline={room.topic.shortTitle} startAt={at} startPaused={paused} />;
  if (step === "rules") return <RulesVideo key={key} startAt={at} startPaused={paused} />;
  return null;
}
