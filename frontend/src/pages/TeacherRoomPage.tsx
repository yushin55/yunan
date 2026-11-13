import { useEffect, useRef, useState } from "react";
import type { Intro, IntroStep, Participant, Room, Rounds } from "../types/game";
import { usePhaseTimer } from "../features/game/usePhaseTimer";
import EventCard from "../components/EventCard";
import Tabs from "../components/Tabs";
import { useFloor } from "../features/discussion/floor";
import SpeakerStage from "../features/discussion/SpeakerStage";
import { useAutoSummary } from "../features/discussion/useAutoSummary";
import { PHASE_LABELS, PHASE_ORDER, PHASE_SHORT, SPEAKING, TIMED } from "../features/game/phases";
import TableView from "../features/game/TableView";
import { allReady, StartCountdown, useAutoStart } from "../features/game/useAutoStart";
import IntroControl from "../features/teacher/IntroControl";
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
      {present && <ClassScreen room={room} participants={participants} rounds={rounds} offset={offset} onClose={closePresent} />}
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
          {phase !== "lobby" && (
            <button className="button ghost small" data-testid="present-toggle" onClick={openPresent}>
              교실 화면 띄우기
            </button>
          )}
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
          {practice && (
            <p className="teacher-note" data-testid="teacher-practice-note">
              연습용 선생님 화면이에요. 학생 입장, 주제·설정 변경, 발언 검토는 실제 방에서만 쓸 수 있어요.
              {phase === "lobby" && waiting > 0 && " 학생 화면에서 브리핑을 보고 선호 역할을 고르면 시작할 수 있어요."}
            </p>
          )}
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
                {practice ? <p className="muted small lobby-join-note">연습용 방에는 다른 학생이 들어올 수 없어요. 실제 방에서는 이곳에 입장 QR과 방 코드가 보여요.</p> : <RoomCode code={room.code} large />}
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
            <IntroControl intro={intro} room={room} participants={participants} offset={offset} busy={busy} onStep={stepIntro} onMove={moveIntro} preview={!room.intro} />
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
                    {turn && turn.stage !== "qa" && <p className="muted small stage-hint">이름을 누르면 그 학생에게 바로 차례를 줄 수 있어요.</p>}
                  </section>
                )}
                {room.event && phase === "event" && <EventCard event={room.event} collapsible defaultOpen={false} />}
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
                <p className="muted small view-hint">학생별 평가와 학생부 기록 초안은 위의 ‘수행평가 레포트’에서 볼 수 있어요.</p>
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
          <details className="panel guide">
            <summary>진행 안내와 질문 예시</summary>
            <p>{host.teacherGuide.summary}</p>
            <ul>
              {host.teacherGuide.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {host.teacherGuide.caution && <p className="banner warn">{host.teacherGuide.caution}</p>}
            <h4>질문 예시</h4>
            <ul>
              {room.topic.questionPrompts.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </details>
        </TeacherSidebar>
      </div>
    </main>
  );
}

/**
 * What the class sees on the projector: the table, whose turn it is and the time, and at the end
 * who the switcher was. Only public game information, never the teacher's own panels.
 */
function ClassScreen({ room, participants, rounds, offset, onClose }: { room: Room; participants: Participant[]; rounds: Rounds; offset: number; onClose: () => void }) {
  const timer = usePhaseTimer(room, offset);
  const reveal = (room.phase === "reveal" || room.phase === "ended") && rounds.reveal;
  return (
    <div className="class-screen" data-testid="class-screen">
      <header className="class-screen-top">
        <strong>{PHASE_LABELS[room.phase]}</strong>
        {timer.label && <span className="bar-timer">{timer.label}</span>}
        <span className="bar-spacer" />
        <button className="button ghost small" onClick={onClose}>
          교실 화면 닫기
        </button>
      </header>
      {SPEAKING.includes(room.phase) && <SpeakerStage room={room} participants={participants} offset={offset} />}
      <div className="class-screen-table">
        <TableView room={room} participants={participants} rounds={rounds} offset={offset} overview />
        {room.paused && <PauseOverlay />}
        {reveal && (
          <section className="panel class-screen-result">
            <RevealSummary reveal={reveal} participants={participants} topic={room.topic} />
          </section>
        )}
      </div>
    </div>
  );
}
