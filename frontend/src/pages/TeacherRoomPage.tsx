import { useEffect, useState } from "react";
import { BookOpen, Flag, Pause, Play, Plus, SkipForward, Wifi, WifiOff } from "lucide-react";
import EventCard from "../components/EventCard";
import PhaseHeader from "../components/PhaseHeader";
import ChatFeed from "../features/chat/ChatFeed";
import { PHASE_LABELS, PHASE_ORDER, TEACHER_TODO, TIMED } from "../features/game/phases";
import StatementBoard from "../features/game/StatementBoard";
import TableView from "../features/game/TableView";
import IssueBriefing from "../features/briefing/IssueBriefing";
import RoomCode from "../features/room/RoomCode";
import type { RoomApi } from "../features/room/useRoom";
import LobbySettings from "../features/teacher/LobbySettings";
import ModerationPanel from "../features/teacher/ModerationPanel";
import ParticipationBoard, { GameSummary } from "../features/teacher/ParticipationBoard";
import TopicPicker from "../features/topics/TopicPicker";
import { useTopics } from "../features/topics/useTopics";
import RevealView from "../features/voting/RevealView";


function useServerNow(offset: number) {
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 5000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

export default function TeacherRoomPage({ api }: { api: RoomApi }) {
  const { state, action, busy, error, offset, online } = api;
  const { room, participants, rounds } = state!;
  const host = state!.host!;
  const { catalog } = useTopics();
  const [changingTopic, setChangingTopic] = useState(false);
  const serverNow = useServerNow(offset);
  const phase = room.phase;
  const next = PHASE_ORDER[PHASE_ORDER.indexOf(phase) + 1];
  const count = participants.length;
  const waiting = participants.filter((p) => !p.prefsDone).length;
  const blockers = [
    count < room.minStudents && `학생이 ${room.minStudents}명 이상 필요해요 (지금 ${count}명)`,
    count > room.maxStudents && `학생은 최대 ${room.maxStudents}명이에요`,
    waiting > 0 && `${waiting}명이 아직 선호 역할을 고르는 중이에요`,
  ].filter(Boolean) as string[];
  const submittedNow = (key: string) => participants.filter((p) => p.submitted.includes(key)).length;

  return (
    <main className="teacher-room">
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
        <span className={`net ${online ? "on" : "off"}`}>{online ? <Wifi size={16} aria-label="연결됨" /> : <WifiOff size={16} aria-label="연결 끊김" />}</span>
      </header>

      <div className="teacher-grid">
        <div className="teacher-main">
          <PhaseHeader room={room} offset={offset} todo={TEACHER_TODO[phase]} />
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}

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
                {phase === "reveal" ? (
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

          {participants.length > 0 && (
            <div className="teacher-table" aria-label="원탁 보기">
              <TableView room={room} participants={participants} rounds={rounds} offset={offset} />
            </div>
          )}

          {phase === "lobby" && (
            <>
              <section className="panel">
                <div className="panel-head">
                  <h3>주제</h3>
                  <button className="button ghost small" onClick={() => setChangingTopic((v) => !v)}>
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
                {catalog && (
                  <LobbySettings
                    key={JSON.stringify(room.settings)}
                    settings={room.settings}
                    range={catalog.config.phaseSecondsRange}
                    busy={busy}
                    onSave={(settings) => void action("settings", settings as unknown as Record<string, unknown>)}
                  />
                )}
              </section>
            </>
          )}

          {(phase === "role" || phase === "statement" || phase === "vote") && (
            <section className="panel progress-panel">
              <h3>
                {phase === "role" ? "역할을 확인한 학생" : phase === "statement" ? "입장 발표를 낸 학생" : "투표한 학생"}{" "}
                <strong data-testid="progress-count">
                  {submittedNow(phase)}/{count}
                </strong>
              </h3>
              <div className="progress">
                <i style={{ width: `${(submittedNow(phase) / Math.max(1, count)) * 100}%` }} />
              </div>
              <p className="muted small">
                {phase === "statement"
                  ? "발표 내용은 모두 내거나 시간이 끝나면 한꺼번에 공개돼요."
                  : phase === "vote"
                    ? "누가 누구에게 투표했는지는 결과 공개 때 함께 보여요."
                    : "역할과 역할 전환 여부는 각 학생 화면에만 보여요. 선생님 화면에도 표시되지 않아요."}
              </p>
            </section>
          )}

          {(phase === "event" || phase === "rebuttal") && (
            <>
              {room.event && <EventCard event={room.event} />}
              <details className="panel">
                <summary>입장 발표 ({rounds.statements.filter((r) => !r.timedOut).length}명)</summary>
                <StatementBoard rows={rounds.statements} participants={participants} topic={room.topic} />
              </details>
              <section className="panel chat-panel">
                <h3>토론 채팅</h3>
                <ChatFeed messages={rounds.chat} participants={participants} topic={room.topic} emptyText="아직 발언이 없어요." />
              </section>
            </>
          )}

          {(phase === "reveal" || phase === "ended") && rounds.reveal && (
            <section className="panel">
              <RevealView reveal={rounds.reveal} participants={participants} topic={room.topic} />
            </section>
          )}
          {phase === "ended" && <GameSummary participants={participants} rounds={rounds} />}
        </div>

        <aside className="teacher-side">
          {phase === "lobby" && (
            <section className="panel">
              <h3>학생 입장</h3>
              <RoomCode code={room.code} large />
            </section>
          )}
          <section className="panel">
            <h3>
              참여 현황{" "}
              <span className="muted small">
                {count}명 · {room.minStudents}~{room.maxStudents}명
              </span>
            </h3>
            <ParticipationBoard
              room={room}
              participants={participants}
              rounds={rounds}
              serverNow={serverNow}
              busy={busy}
              onKick={phase === "lobby" ? (uid) => void action("kick", { targetUid: uid }) : undefined}
            />
          </section>
          <ModerationPanel host={host} busy={busy} onReview={(entryId, decision) => void action("review", { entryId, decision })} />
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
