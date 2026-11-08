import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, History } from "lucide-react";
import { loadHistory, type PastDebate } from "./teacherStorage";

const fmt = (t: number) => new Date(t).toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" });
const RECENT = 5;

/**
 * The latest finished debates, each linking to its saved result page, plus the full list.
 * During a live game (`newTab`) the links open in a new tab so the running game stays on screen.
 */
export default function PastDebates({ exclude, open = false, newTab = false }: { exclude?: string; open?: boolean; newTab?: boolean }) {
  const [list, setList] = useState<PastDebate[]>(loadHistory);
  const shown = list.filter((d) => d.key !== exclude);
  const target = newTab ? { target: "_blank", rel: "noopener" } : {};
  return (
    <details className="panel past-debates" open={open} data-testid="past-debates" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setList(loadHistory())}>
      <summary>
        <History size={17} aria-hidden /> 진행된 토론 <span className="muted small">{shown.length}개</span>
      </summary>
      {shown.length === 0 ? (
        <p className="muted small">결과 공개까지 진행한 토론은 이 기기에 자동으로 저장돼요.</p>
      ) : (
        <ul className="past-list">
          {shown.slice(0, RECENT).map((d) => (
            <li key={d.key}>
              <Link className="past-item" to={`/teacher/history/${encodeURIComponent(d.key)}`} {...target}>
                <strong>{d.topic.shortTitle}</strong>
                <span className="muted small">
                  {fmt(d.endedAt)} · {d.participants.length}명 · 발언 {d.transcript.length}개{d.practice ? " · 연습" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className="button ghost small full past-all" to="/teacher/history" {...target}>
        전체 목록 보기 <ArrowRight size={15} />
      </Link>
    </details>
  );
}
