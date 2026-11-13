import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bot, CalendarDays, History, MessageSquareText, Search, Trash2, Users } from "lucide-react";
import { buildReport, CRITERIA } from "../features/teacher/report";
import { deleteDebate, loadHistory, type PastDebate } from "../features/teacher/teacherStorage";
import type { Reveal } from "../types/game";
import { useTeacherStorage } from "../features/teacher/useTeacherStorage";

export const OUTCOME_SHORT: Record<Reveal["outcome"], { label: string; tone: "ok" | "warn" | "muted" }> = {
  found: { label: "역할 전환자 찾음", tone: "ok" },
  partial: { label: "일부 찾음", tone: "warn" },
  missed: { label: "들키지 않음", tone: "warn" },
  tie: { label: "득표 동률", tone: "muted" },
  no_votes: { label: "투표 없음", tone: "muted" },
};

export const fmtDay = (t: number) => new Date(t).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

type Filter = "all" | "class" | "practice";

/** The signed-in teacher's finished debates, newest first. */
export default function DebateHistoryPage() {
  const [list, setList] = useTeacherStorage("history", loadHistory);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const shown = list.filter(
    (d) =>
      (filter === "all" || (filter === "practice") === d.practice) &&
      (!query.trim() || `${d.topic.title} ${d.topic.shortTitle} ${d.participants.map((p) => p.nickname).join(" ")}`.includes(query.trim())),
  );
  // Group by day so a week of classes reads like a timetable.
  const days = shown.reduce<{ day: string; items: PastDebate[] }[]>((acc, d) => {
    const day = fmtDay(d.endedAt);
    const last = acc.at(-1);
    if (last?.day === day) last.items.push(d);
    else acc.push({ day, items: [d] });
    return acc;
  }, []);
  const practiceCount = list.filter((d) => d.practice).length;

  return (
    <main className="setup history-page" data-testid="history-page">
      <Link to="/teacher/new" className="back-link">
        <ArrowLeft size={16} /> 방 만들기로
      </Link>
      <span className="eyebrow">선생님 · 진행된 토론</span>
      <h1>지난 토론의 결과를 다시 볼 수 있어요</h1>
      <p className="muted">로그인한 선생님의 토론 기록만 보여요. 결과와 메모, 수정한 평가는 내 계정에 저장되어 다른 기기에서도 볼 수 있어요. 최근 30개를 표시해요.</p>

      {list.length > 0 && (
        <div className="history-tools">
          <div className="segmented" role="radiogroup" aria-label="토론 종류">
            {(
              [
                ["all", `전체 ${list.length}`],
                ["class", `수업 ${list.length - practiceCount}`],
                ["practice", `연습 ${practiceCount}`],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <label key={id} className={filter === id ? "active" : ""}>
                <input type="radio" name="history-filter" checked={filter === id} onChange={() => setFilter(id)} />
                {label}
              </label>
            ))}
          </div>
          <div className="log-search">
            <Search size={15} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="주제나 학생 이름으로 찾기" aria-label="토론 찾기" />
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="history-empty panel">
          <History size={32} aria-hidden />
          <p>
            <strong>아직 진행된 토론이 없어요.</strong>
          </p>
          <p className="muted small">게임을 결과 공개까지 진행하면 여기에 쌓여요. 연습 모드로 먼저 한 판 해 볼 수도 있어요.</p>
          <div className="history-empty-actions">
            <Link to="/teacher/new" className="button primary">
              방 만들기
            </Link>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted empty">조건에 맞는 토론이 없어요.</p>
      ) : (
        days.map(({ day, items }) => (
          <section key={day} className="history-day">
            <h2>
              <CalendarDays size={16} aria-hidden /> {day}
            </h2>
            <ul className="history-grid">
              {items.map((d) => (
                <DebateCard
                  key={d.key}
                  debate={d}
                  onDelete={() => {
                    if (!confirm(`‘${d.topic.shortTitle}’ 토론 기록과 메모, 수정한 평가를 지울까요?`)) return;
                    deleteDebate(d.key);
                    setList(loadHistory());
                  }}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

function DebateCard({ debate: d, onDelete }: { debate: PastDebate; onDelete: () => void }) {
  const metRate = useMemo(() => {
    const r = buildReport(d.topic, d.participants, d.transcript, d.moderation);
    const cells = r.students.length * CRITERIA.length;
    return cells ? Math.round((r.students.reduce((n, s) => n + CRITERIA.filter((c) => s.findings[c.id].level === "met").length, 0) / cells) * 100) : 0;
  }, [d]);
  const outcome = d.reveal ? OUTCOME_SHORT[d.reveal.outcome] : null;
  const name = (uid: string) => d.participants.find((p) => p.uid === uid)?.nickname ?? "나간 참가자";
  return (
    <li className="history-card" data-testid="history-card">
      <Link to={`/teacher/history/${encodeURIComponent(d.key)}`} className="history-card-link">
        <div className="history-card-top">
          <span className="history-time">{fmtTime(d.endedAt)}</span>
          {d.practice && (
            <span className="practice-tag">
              <Bot size={13} aria-hidden /> 연습
            </span>
          )}
          {outcome && <span className={`history-outcome ${outcome.tone}`}>{outcome.label}</span>}
        </div>
        <strong className="history-topic">{d.topic.shortTitle}</strong>
        <span className="history-title muted small">{d.topic.title}</span>
        {d.reveal && d.reveal.switchers.length > 0 && <span className="history-switcher small">역할 전환자 · {d.reveal.switchers.map((s) => name(s.uid)).join(", ")}</span>}
        <div className="history-stats">
          <span>
            <Users size={14} aria-hidden /> {d.participants.length}명
          </span>
          <span>
            <MessageSquareText size={14} aria-hidden /> 발언 {d.transcript.length}
          </span>
          <span className="history-rate" title="평가 기준표 9개 항목 중 충족으로 판정된 비율 (자동 판정 기준)">
            <span className="score-bar" aria-hidden>
              <i style={{ width: `${metRate}%` }} />
            </span>
            충족 {metRate}%
          </span>
        </div>
        <span className="history-open">
          결과 보기 <ArrowRight size={15} />
        </span>
      </Link>
      <button className="icon-button history-delete" aria-label={`${d.topic.shortTitle} 기록 지우기`} title="기록 지우기" onClick={onDelete}>
        <Trash2 size={15} />
      </button>
    </li>
  );
}
