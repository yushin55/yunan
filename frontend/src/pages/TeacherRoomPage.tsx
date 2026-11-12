import { useEffect, useState } from "react";
import { BookOpen, FastForward, Flag, Maximize2, Minimize2, Pause, Play, Plus, SkipForward, Wifi, WifiOff } from "lucide-react";
import type { Participant, Room, Rounds } from "../types/game";
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
import IntroControl from "../features/teacher/IntroControl";
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

  return (
    <main className={`teacher-room${speaking || phase === "vote" ? " discussing" : ""}`}>
      {present && <ClassScreen room={room} participants={participants} rounds={rounds} offset={offset} onClose={closePresent} />}
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
        {phase !== "lobby" && (
          <button className="button ghost small" data-testid="present-toggle" onClick={openPresent}>
            <Maximize2 size={15} /> 교실 화면 (전체 화면)
          </button>
        )}
        {barControls && <div className="teacher-practice-controls">{barControls}</div>}
        <span className={`net ${online ? "on" : "off"}`}>{online ? <Wifi size={16} aria-label="연결됨" /> : <WifiOff size={16} aria-label="연결 끊김" />}</span>
      </header>

      <div className="teacher-grid">
        <div className="teacher-main">
          {practice && (
            <p className="banner" data-testid="teacher-practice-note">
              연습용 선생님 화면이에요. 참여 현황과 발언 정리를 보며 진행을 조작하고, 게임 화면은 ‘교실 화면’으로 띄워요. 학생 입장·주제 및 설정 변경·발언 검토는 실제 방에서 사용할 수 있어요.
              {phase === "lobby" && waiting > 0 && " 학생 화면에서 브리핑을 보고 선호 역할을 고르면 시작할 수 있어요."}
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
                <IntroControl intro={room.intro} room={room} participants={participants} offset={offset} busy={busy} onStep={(step) => void action("intro", { step })} />
              ) : (
                <section className="panel">
                  <h3>이슈 브리핑</h3>
                  <p className="muted small">학생들은 각자 화면에서 이 브리핑을 끝까지 본 뒤 역할을 골라요. 교실 화면에 함께 틀어도 좋아요. 실제 보도 요약이니 수업 전에 출처를 확인해 주세요.</p>
                  <IssueBriefing key={room.topicId} briefing={room.topic.briefing} topicId={room.topicId} headline={room.topic.shortTitle} />
                </section>
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
          <Minimize2 size={15} /> 나가기
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
