import type { DiscussionSummary, Topic } from "../../types/game";
import { roleName } from "../roles/roleName";

/** Discussion so far, by role. Roles only: it never says who said what or who sounds suspicious. */
export default function SummaryBoard({ summary, topic, status, bare }: { summary?: DiscussionSummary; topic: Topic; status?: "idle" | "working" | "failed"; bare?: boolean }) {
  if (!summary && !status) return null;
  return (
    <section className="panel summary-board" data-testid="summary-board" aria-live="polite">
      {!bare && (
        <div className="panel-head">
          <h3 className="memo-title">토론 정리</h3>
          {status === "working" && <span className="muted small">정리하는 중…</span>}
        </div>
      )}
      {status === "failed" && <p className="summary-note warn">정리를 새로 만들지 못했어요. 발언 기록은 그대로 남아 있고, 다음 발언 뒤에 다시 시도해요.</p>}
      {!summary ? (
        <p className="muted summary-empty">발언이 쌓이면 역할별 주장과 부딪히는 지점을 자동으로 정리해요.</p>
      ) : (
        <div className="summary-body" tabIndex={0}>
          {(summary.clashes.length > 0 || summary.questions.length > 0) && (
            <div className="summary-open">
            {summary.clashes.length > 0 && (
              <div className="summary-group clash">
                <h4>부딪히는 지점</h4>
                <ul>
                  {summary.clashes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.questions.length > 0 && (
              <div className="summary-group question">
                <h4>아직 남은 질문</h4>
                <ul>
                  {summary.questions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            </div>
          )}
          <ul className="summary-positions">
            {summary.positions.map((row) => (
              <li key={row.roleId} className="summary-role" data-testid="summary-position">
                <h4>{roleName(topic, row.roleId)}</h4>
                <ul>
                  {row.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="summary-note">{summary.source === "local" ? "연습용 간이 정리예요. 실제 방에서는 AI가 정리해요." : "AI가 발언 기록만 보고 정리했어요. 틀릴 수 있으니 기록과 함께 봐 주세요."}</p>
        </div>
      )}
    </section>
  );
}
