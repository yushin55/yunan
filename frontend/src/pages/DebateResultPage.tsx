import { Link, useParams } from "react-router-dom";
import SummaryBoard from "../features/discussion/SummaryBoard";
import { PHASE_ORDER } from "../features/game/phases";
import { roleName } from "../features/roles/roleName";
import { GameSummary } from "../features/teacher/ParticipationBoard";
import { MemoList } from "../features/teacher/PhaseMemo";
import TeacherReport from "../features/teacher/TeacherReport";
import { loadDebate } from "../features/teacher/teacherStorage";
import RevealView from "../features/voting/RevealView";
import { fmtDay, fmtTime, OUTCOME_SHORT } from "./DebateHistoryPage";

/** The final result screen of a finished debate, rebuilt from what this browser saved. */
export default function DebateResultPage() {
  const { key = "" } = useParams();
  const d = loadDebate(decodeURIComponent(key));
  if (!d)
    return (
      <main className="page-loading">
        <p>이 토론 기록을 찾을 수 없어요. 지웠거나 다른 기기에서 진행한 토론일 수 있어요.</p>
        <Link to="/teacher/history" className="button primary">
          진행된 토론 목록
        </Link>
      </main>
    );
  const outcome = d.reveal ? OUTCOME_SHORT[d.reveal.outcome] : null;
  const switchers = new Set(d.reveal?.switchers.map((s) => s.uid));
  const notes = PHASE_ORDER.filter((p) => d.notes[p]?.length);
  return (
    <main className="teacher-room history-result" data-testid="history-result">
      <header className="teacher-top">
        <Link to="/teacher/history" className="button ghost small">
          진행된 토론 목록
        </Link>
        <span className="tag">지난 토론 결과</span>
        <span className="topic-chip" title={d.topic.title}>
          {d.topic.title}
        </span>
        {!d.practice && (
          <span className="code-chip">
            방 코드 <strong>{d.roomCode}</strong>
          </span>
        )}
        {d.practice && (
          <span className="practice-tag">연습</span>
        )}
      </header>

      <div className="teacher-grid">
        <div className="teacher-main">
          <section className="history-head">
            <span className="eyebrow">
              {fmtDay(d.endedAt)} · {fmtTime(d.createdAt) === fmtTime(d.endedAt) ? fmtTime(d.endedAt) : `${fmtTime(d.createdAt)}~${fmtTime(d.endedAt)}`}
            </span>
            <h1>{d.topic.shortTitle}</h1>
            <p className="muted">
              {d.participants.length}명 참여 · 발언 {d.transcript.length}개{outcome ? ` · ${outcome.label}` : ""}
            </p>
          </section>

          {d.reveal ? (
            <section className="panel result-panel">
              <h3>결과</h3>
              <RevealView reveal={d.reveal} participants={d.participants} topic={d.topic} />
            </section>
          ) : (
            <p className="banner">투표 결과가 저장되지 않은 토론이에요.</p>
          )}

          <TeacherReport topic={d.topic} participants={d.participants} transcript={d.transcript} moderation={d.moderation} notes={d.notes} at={d.endedAt} editKey={d.key} roomId={d.practice ? undefined : (d.roomId ?? d.key.split("-")[0])} />
          {d.summary && <SummaryBoard summary={d.summary} topic={d.topic} />}
        </div>

        <aside className="teacher-side">
          <section className="panel">
            <h3>참가자와 역할</h3>
            <ul className="history-roster">
              {d.participants.map((p) => (
                <li key={p.uid}>
                  <strong>{p.nickname}</strong>
                  <span className="muted small">{roleName(d.topic, p.roleId) || "역할 없음"}</span>
                  {switchers.has(p.uid) && <span className="pill warn">역할 전환자</span>}
                </li>
              ))}
            </ul>
          </section>
          <GameSummary participants={d.participants} rounds={{ transcript: d.transcript, reveal: d.reveal }} />
          <section className="panel">
            <h3>단계별 메모</h3>
            {notes.length ? (
              notes.map((p) => <MemoList key={p} entries={d.notes[p]!} participants={d.participants} phase={p} />)
            ) : (
              <p className="muted small">이 토론에 남긴 메모가 없어요.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
