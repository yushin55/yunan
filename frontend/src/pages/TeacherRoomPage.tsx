import { useEffect, useState } from "react";
import { FastForward, Flag, Maximize2, Minimize2, Pause, Play, Plus, SkipForward, Wifi, WifiOff } from "lucide-react";
import EventCard from "../components/EventCard";
import PhaseHeader from "../components/PhaseHeader";
import { useFloor } from "../features/discussion/floor";
import SpeakerStage from "../features/discussion/SpeakerStage";
import TranscriptFeed, { LineInput } from "../features/discussion/TranscriptFeed";
import { useAutoSummary } from "../features/discussion/useAutoSummary";
import { PHASE_LABELS, PHASE_ORDER, SPEAKING, TEACHER_TODO, TIMED } from "../features/game/phases";
import IssueBriefing from "../features/briefing/IssueBriefing";
import RoomCode from "../features/room/RoomCode";
import type { RoomApi } from "../features/room/useRoom";
import LobbySettings from "../features/teacher/LobbySettings";
import ModerationPanel from "../features/teacher/ModerationPanel";
import ParticipationBoard, { GameSummary } from "../features/teacher/ParticipationBoard";
import PhaseMemo, { usePhaseNotes } from "../features/teacher/PhaseMemo";
import TeacherReport from "../features/teacher/TeacherReport";
import { gameKey, loadDebate, saveDebate } from "../features/teacher/teacherStorage";
import TopicPicker from "../features/topics/TopicPicker";
import { useTopics } from "../features/topics/useTopics";
import RevealView from "../features/voting/RevealView";


function useServerNow(offset: number) {
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 2000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

export default function TeacherRoomPage({ api, practice = false, barControls }: { api: RoomApi; practice?: boolean; barControls?: React.ReactNode }) {
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
  // The summary is no longer shown here, but the teacher's screen still keeps it fresh for the students' statement cards.
  useAutoSummary(rounds.transcript, () => quiet("summary"));
  const next = PHASE_ORDER[PHASE_ORDER.indexOf(phase) + 1];
  const count = participants.length;
  const waiting = participants.filter((p) => !p.prefsDone).length;
  const blockers = [
    count < room.minStudents && `학생이 ${room.minStudents}명 이상 필요해요 (지금 ${count}명)`,
    count > room.maxStudents && `학생은 최대 ${room.maxStudents}명이에요`,
    waiting > 0 && `${waiting}명이 아직 선호 역할을 고르는 중이에요`,
  ].filter(Boolean) as string[];
  const submittedNow = (key: string) => participants.filter((p) => p.submitted.includes(key)).length;
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
    <main className={`teacher-room${speaking || phase === "vote" ? " discussing" : ""}${present ? " present" : ""}`}>
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
        {present && toReview > 0 && <span className="teacher-attention" data-testid="review-badge">확인할 발언 {toReview}</span>}
        {phase !== "lobby" && (
          <button className="button ghost small" data-testid="present-toggle" aria-pressed={present} onClick={() => setPresent((v) => !v)}>
            {present ? <Minimize2 size={15} /> : <Maximize2 size={15} />} {present ? "선생님 패널 보기" : "교실 화면으로 크게"}
          </button>
        )}
        {barControls && <div className="teacher-practice-controls">{barControls}</div>}
        <span className={`net ${online ? "on" : "off"}`}>{online ? <Wifi size={16} aria-label="연결됨" /> : <WifiOff size={16} aria-label="연결 끊김" />}</span>
      </header>

      <div className="teacher-grid">
        <div className="teacher-main">
          {practice && (
            <p className="banner" data-testid="teacher-practice-note">
              연습용 선생님 화면이에요. 학생 화면과 같은 게임을 보며 진행을 조작할 수 있어요. 학생 입장·주제 및 설정 변경·발언 검토는 실제 방에서 사용할 수 있어요.
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

          <section className="panel live-participation" data-testid="participation-panel">
            <div className="panel-head">
              <h3 className="memo-title">
                <span className="live-dot" aria-hidden /> 참여 현황
              </h3>
              <span className="muted small">
                {count}명 · {room.minStudents}~{room.maxStudents}명
              </span>
            </div>
            <ParticipationBoard
              room={room}
              participants={participants}
              rounds={rounds}
              serverNow={serverNow}
              alwaysOnline={practice}
              floor={floor}
              floorSeconds={floorSeconds}
              busy={busy}
              onKick={phase === "lobby" && !practice ? (uid) => void action("kick", { targetUid: uid }) : undefined}
            />
          </section>


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
              <section className="panel">
                <h3>이슈 브리핑</h3>
                <p className="muted small">학생들은 각자 화면에서 이 브리핑을 끝까지 본 뒤 역할을 골라요. 교실 화면에 함께 틀어도 좋아요. 실제 보도 요약이니 수업 전에 출처를 확인해 주세요.</p>
                <IssueBriefing key={room.topicId} briefing={room.topic.briefing} topicId={room.topicId} headline={room.topic.shortTitle} />
              </section>
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

          {/* The live board covers this for the teacher; the big count is for the projected classroom screen. */}
          {present && (phase === "role" || phase === "vote") && (
            <section className="panel progress-panel">
              <h3>
                {phase === "role" ? "역할을 확인한 학생" : "투표한 학생"}{" "}
                <strong data-testid="progress-count">
                  {submittedNow(phase)}/{count}
                </strong>
              </h3>
              <div className="progress">
                <i style={{ width: `${(submittedNow(phase) / Math.max(1, count)) * 100}%` }} />
              </div>
              <p className="muted small">
                {phase === "vote" ? "누가 누구에게 투표했는지는 결과 공개 때 함께 보여요." : "역할과 역할 전환 여부는 각 학생 화면에만 보여요. 선생님 화면에도 표시되지 않아요."}
              </p>
            </section>
          )}

          {room.event && (phase === "event" || phase === "rebuttal") && <EventCard key={phase} event={room.event} collapsible defaultOpen={phase === "event"} />}

          {(speaking || phase === "vote") && (
            <div className="discussion-grid">
              <section className="panel" data-testid="transcript-panel">
                <h3 className="memo-title">발언 기록</h3>
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
                {speaking && speaker && <LineInput speaker={speaker.nickname} disabled={busy} onAdd={(text) => void action("line-add", { text, phaseVersion: room.phaseVersion })} />}
              </section>
            </div>
          )}

          {/* On the projected classroom screen the result is the main event; otherwise it sits small in the side column. */}
          {present && finished && rounds.reveal && (
            <section className="panel">
              <RevealView reveal={rounds.reveal} participants={participants} topic={room.topic} />
            </section>
          )}
          {finished && <TeacherReport topic={room.topic} participants={participants} transcript={rounds.transcript} moderation={host.moderation} notes={notes} at={room.endedAt ?? undefined} editKey={key} roomId={practice ? undefined : room.roomId} />}
          {phase === "ended" && <GameSummary participants={participants} rounds={rounds} />}
        </div>

        <aside className="teacher-side">
          <PhaseMemo phase={phase} notes={notes} participants={participants} onAdd={addNote} onRemove={removeNote} />
          {!present && finished && rounds.reveal && (
            <section className="panel reveal-side" data-testid="reveal-side">
              <h3 className="memo-title">결과 공개</h3>
              <RevealView reveal={rounds.reveal} participants={participants} topic={room.topic} compact />
            </section>
          )}
          {phase === "lobby" && (
            <section className="panel">
              <h3>학생 입장</h3>
              {practice ? <p className="muted">연습용 방에는 다른 학생이 입장할 수 없어요. 실제 방에서는 이곳에 입장 QR과 방 코드가 표시돼요.</p> : <RoomCode code={room.code} large />}
            </section>
          )}
          {/* Only when something is waiting for the teacher: held-back lines stay off the screen until reviewed. */}
          {toReview > 0 && <ModerationPanel host={host} busy={busy || practice} onReview={(entryId, decision) => void action("review", { entryId, decision })} />}
        </aside>
      </div>
    </main>
  );
}
