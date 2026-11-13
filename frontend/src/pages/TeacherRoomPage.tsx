import { useEffect, useState } from "react";
import { BookOpen, FastForward, Flag, Maximize2, Minimize2, Pause, Play, Plus, SkipForward, Wifi, WifiOff } from "lucide-react";
import type { IntroStep, Participant, Role, Room, Rounds } from "../types/game";
import { usePhaseTimer } from "../features/game/usePhaseTimer";
import EventCard from "../components/EventCard";
import PhaseHeader from "../components/PhaseHeader";
import { QuestionList, StatementList } from "../features/discussion/DiscussionNotes";
import { useFloor } from "../features/discussion/floor";
import SpeakerStage from "../features/discussion/SpeakerStage";
import TranscriptFeed, { TeacherLineInput } from "../features/discussion/TranscriptFeed";
import { useAutoSummary } from "../features/discussion/useAutoSummary";
import { PHASE_LABELS, PHASE_ORDER, SPEAKING, TEACHER_TODO, TIMED } from "../features/game/phases";
import TableView from "../features/game/TableView";
import { allReady, StartCountdown, useAutoStart } from "../features/game/useAutoStart";
import IssueBriefing from "../features/briefing/IssueBriefing";
import RulesVideo from "../features/briefing/RulesVideo";
import { introElapsed } from "../features/briefing/intro";
import PhaseBanner from "../components/PhaseBanner";
import RoleAvatar from "../features/roles/RoleAvatar";
import IntroControl, { NEXT } from "../features/teacher/IntroControl";
import { lobbyStepKey } from "./StudentRoomPage";
import RoomCode from "../features/room/RoomCode";
import type { RoomApi } from "../features/room/useRoom";
import LobbySettings from "../features/teacher/LobbySettings";
import ModerationPanel from "../features/teacher/ModerationPanel";
import ParticipationBoard, { GameSummary, ParticipationGrid } from "../features/teacher/ParticipationBoard";
import PhaseMemo, { usePhaseNotes } from "../features/teacher/PhaseMemo";
import TeacherReport from "../features/teacher/TeacherReport";
import { gameKey, loadDebate, saveDebate } from "../features/teacher/teacherStorage";
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

/** `startIn` comes from the practice page, which starts the game itself; a real room starts from here. */
export default function TeacherRoomPage({ api, practice = false, barControls, startIn }: { api: RoomApi; practice?: boolean; barControls?: React.ReactNode; startIn?: number | null }) {
  const { state, action, quiet, busy, error, offset, online } = api;
  const { room, participants, rounds } = state!;
  const host = state!.host!;
  const { catalog } = useTopics(!practice);
  const [changingTopic, setChangingTopic] = useState(false);
  const [present, setPresent] = useState(false);
  const serverNow = useServerNow(offset);
  const phase = room.phase;
  const speaking = SPEAKING.includes(phase);
  const turn = room.turn;
  const { floor, seconds: floorSeconds } = useFloor(room, offset);
  const speaker = participants.find((p) => p.uid === (floor?.uid ?? (turn?.stage !== "qa" ? turn?.uid : undefined)));
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

  return (
    <main className={`teacher-room${speaking || phase === "vote" ? " discussing" : ""}`}>
      {present && <ClassScreen room={room} participants={participants} rounds={rounds} offset={offset} onClose={closePresent} busy={busy} onIntroStep={(step) => void action("intro", { step })} />}
      {!present && <PhaseBanner room={room} offset={offset} />}
      <StartCountdown left={countdown} />
      <header className="teacher-top">
        <span className="brand-mark">
          브릿지<span>.</span>
        </span>
        <span className="tag">선생님 진행 화면</span>
        <span className="topic-chip" title={room.topic.title}>
          {room.topic.title}
        </span>
        <span className="code-chip">
          방 코드 <strong>{room.code}</strong>
        </span>
        {toReview > 0 && <span className="teacher-attention" data-testid="review-badge">확인할 발언 {toReview}</span>}
        <button className="button ghost small" data-testid="present-toggle" onClick={openPresent}>
          <Maximize2 size={15} /> 교실 화면 (전체 화면)
        </button>
        {barControls && <div className="teacher-practice-controls">{barControls}</div>}
        <span className={`net ${online ? "on" : "off"}`}>{online ? <Wifi size={16} aria-label="연결됨" /> : <WifiOff size={16} aria-label="연결 끊김" />}</span>
      </header>

      <div className="teacher-grid">
        <div className="teacher-main">
          {practice && (
            <p className="banner" data-testid="teacher-practice-note">
              연습용 선생님 화면이에요. 학생 입장·설정 변경·발언 검토는 실제 방에서만 돼요.
            </p>
          )}
          <PhaseHeader room={room} offset={offset} todo={TEACHER_TODO[phase]} hideTimer={Boolean(turn)} />
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}

          {speaking && <SpeakerStage room={room} participants={participants} offset={offset} busy={busy} onCall={(uid) => void action("speaker", { targetUid: uid, phaseVersion: room.phaseVersion })} />}

          <div className="run-row">
          {phase === "lobby" ? (
            <div className="controls">
              <button className="button primary large" data-testid="start-game" disabled={busy || blockers.length > 0} onClick={() => void action("start")}>
                <Play size={18} /> 게임 시작
              </button>
              {blockers.length > 0 && (
                <ul className="blockers">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            phase !== "ended" && (
              <div className="controls" aria-label="진행 조작">
                {TIMED.includes(phase) &&
                  (room.paused ? (
                    <button className="button secondary" disabled={busy} onClick={() => void action("resume")}>
                      <Play size={17} /> 재개
                    </button>
                  ) : (
                    <button className="button secondary" disabled={busy} onClick={() => void action("pause")}>
                      <Pause size={17} /> 일시정지
                    </button>
                  ))}
                {TIMED.includes(phase) && (
                  <button className="button ghost" disabled={busy} onClick={() => void action("extend", { seconds: 60 })}>
                    <Plus size={17} /> 1분 연장
                  </button>
                )}
                {phase === "event" && room.reading && (
                  <>
                    <span className="reading-count" data-testid="reading-count">
                      사건 카드 읽는 중 {participants.filter((p) => p.submitted.includes("event")).length}/{count}명
                    </span>
                    <button className="button secondary" data-testid="open-questions" disabled={busy} onClick={() => void action("open-questions")}>
                      기다리지 않고 질문 시작
                    </button>
                  </>
                )}
                {turn && (
                  <button className="button ghost" data-testid="next-phase" disabled={busy} onClick={() => void action("skip-phase", { phaseVersion: room.phaseVersion })}>
                    <FastForward size={17} /> 건너뛰고 {PHASE_LABELS[next]}
                  </button>
                )}
                {turn ? (
                  <button className="button primary" data-testid="next-turn" disabled={busy} onClick={() => void action("next", { phaseVersion: room.phaseVersion })}>
                    <SkipForward size={17} /> {upcoming ? `다음 차례: ${upcoming.nickname}` : `다음 단계: ${PHASE_LABELS[next]}`}
                  </button>
                ) : phase === "reveal" ? (
                  <button className="button primary" disabled={busy} onClick={() => void action("end")}>
                    <Flag size={17} /> 게임 종료
                  </button>
                ) : (
                  <button className="button primary" data-testid="next-phase" disabled={busy} onClick={() => void action("next", { phaseVersion: room.phaseVersion })}>
                    <SkipForward size={17} /> 다음 단계: {PHASE_LABELS[next]}
                  </button>
                )}
              </div>
            )
          )}
          </div>

          {phase === "lobby" && (
            <>
              <section className="panel">
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
              {room.intro ? (
                <IntroControl intro={room.intro} room={room} participants={participants} offset={offset} busy={busy} onStep={(step) => void action("intro", { step })} onPresent={openPresent} hideVideo={present} />
              ) : (
                !present && (
                  <section className="panel">
                    <div className="panel-head">
                      <h3>이슈 브리핑 · 게임 규칙</h3>
                      <button className="button primary small" onClick={openPresent}>
                        <Maximize2 size={15} /> 크게 틀기
                      </button>
                    </div>
                    <IntroVideos room={room} />
                  </section>
                )
              )}
              <section className="panel">
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
            </>
          )}

          {phase !== "lobby" && (
            <section className="panel" data-testid="participation-panel">
              <h3>
                참여 현황 <span className="muted small">{count}명</span>
              </h3>
              <ParticipationGrid room={room} participants={participants} rounds={rounds} serverNow={practice ? room.createdAt : serverNow} speakingUid={floor?.uid ?? (turn?.stage !== "qa" ? turn?.uid : undefined)} floor={floor} floorSeconds={floorSeconds} alwaysOnline={practice} />
            </section>
          )}

          {room.event && phase === "event" && <EventCard event={room.event} collapsible defaultOpen={false} />}

          {phase !== "lobby" && phase !== "role" && (
            <div className="discussion-grid">
              <section className="panel">
                <h3 className="memo-title">학생별 입장 발언</h3>
                <StatementList room={room} participants={participants} rounds={rounds} />
              </section>
              {(phase !== "statement" || rounds.transcript.some((l) => l.kind !== "statement")) && (
                <section className="panel">
                  <h3 className="memo-title">질문과 대답</h3>
                  <QuestionList room={room} participants={participants} rounds={rounds} floor={floor} />
                </section>
              )}
            </div>
          )}

          {(speaking || rounds.transcript.length > 0) && phase !== "lobby" && (
            <details className="panel" data-testid="transcript-panel" open={speaking}>
              <summary>발언 기록 고치기 · 대신 적기</summary>
              <TranscriptFeed
                lines={rounds.transcript}
                participants={participants}
                topic={room.topic}
                speakingUid={speaker?.uid}
                emptyText="학생이 마이크를 켜고 말하면 여기에 글로 기록돼요."
                disabled={busy}
                onEdit={(lineId, text) => void action("line-edit", { lineId, text })}
                onDelete={(lineId) => void action("line-delete", { lineId })}
              />
              {speaking && <TeacherLineInput key={phase} room={room} participants={participants} floor={floor} speakingUid={speaker?.uid} disabled={busy} onAdd={(body) => action("line-add", body)} />}
            </details>
          )}
          {finished && <TeacherReport topic={room.topic} participants={participants} transcript={rounds.transcript} moderation={host.moderation} notes={notes} at={room.endedAt ?? undefined} editKey={key} roomId={practice ? undefined : room.roomId} />}
          {phase === "ended" && <GameSummary participants={participants} rounds={rounds} />}
        </div>

        <aside className="teacher-side">
          <PhaseMemo phase={phase} notes={notes} participants={participants} onAdd={addNote} onRemove={removeNote} />
          {finished && rounds.reveal && (
            <section className="panel reveal-side" data-testid="reveal-side">
              <h3 className="memo-title">결과 공개</h3>
              <RevealSummary reveal={rounds.reveal} participants={participants} topic={room.topic} />
            </section>
          )}
          {phase === "lobby" && (
            <section className="panel">
              <h3>학생 입장</h3>
              {practice ? <p className="muted">연습용 방에는 다른 학생이 입장할 수 없어요. 실제 방에서는 이곳에 입장 QR과 방 코드가 표시돼요.</p> : <RoomCode code={room.code} large />}
            </section>
          )}
          {phase === "lobby" && (
            <section className="panel">
              <h3>
                참여 현황{" "}
                <span className="muted small">
                  {count}명 · {room.minStudents}~{room.maxStudents}명
                </span>
              </h3>
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
            </section>
          )}
          <ModerationPanel host={host} busy={busy || practice} onReview={(entryId, decision) => void action("review", { entryId, decision })} />
          <details className="panel guide">
            <summary>
              <BookOpen size={17} aria-hidden /> 진행 안내
            </summary>
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
        </aside>
      </div>
    </main>
  );
}

/**
 * What the class sees on the projector, made for students who are watching rather than playing:
 * the table and whose turn it is, the roles and who plays them, the event card, and at the end the
 * result. Only public game information, never the teacher's own panels.
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
          <Minimize2 size={15} /> 나가기
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
              {room.reading && room.event && (
                <section className="class-screen-event" data-testid="class-event">
                  <EventCard event={room.event} />
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

/**
 * The briefing or the rules video. Teacher-led rooms play whichever the teacher started, in step with
 * every student; practice rooms (no `intro`) let the teacher pick and play freely.
 */
function IntroVideos({ room, offset = 0, step }: { room: Room; offset?: number; step?: IntroStep | null }) {
  const [which, setWhich] = useState<"briefing" | "rules">("briefing");
  const led = room.intro;
  if (!led && step === "briefing") return <IssueBriefing key={room.topicId} briefing={room.topic.briefing} topicId={room.topicId} headline={room.topic.shortTitle} />;
  if (!led && step === "rules") return <RulesVideo />;
  if (led?.step === "briefing") return <IssueBriefing key={led.startedAt} briefing={room.topic.briefing} topicId={room.topicId} headline={room.topic.shortTitle} startAt={introElapsed(led, offset)} />;
  if (led?.step === "rules") return <RulesVideo key={led.startedAt} startAt={introElapsed(led, offset)} />;
  if (led) return null;
  return (
    <>
      <div className="segmented" role="tablist" aria-label="영상 고르기">
        {(["briefing", "rules"] as const).map((v) => (
          <button key={v} role="tab" aria-selected={which === v} className={`button small ${which === v ? "primary" : "ghost"}`} onClick={() => setWhich(v)}>
            {v === "briefing" ? "이슈 브리핑" : "게임 규칙"}
          </button>
        ))}
      </div>
      {which === "briefing" ? <IssueBriefing key={room.topicId} briefing={room.topic.briefing} topicId={room.topicId} headline={room.topic.shortTitle} /> : <RulesVideo />}
    </>
  );
}
