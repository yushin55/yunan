import { useState } from "react";
import { ChevronDown, ShieldAlert } from "lucide-react";
import type { HostState, ModerationEntry } from "../../types/game";
import { KIND_LABELS } from "../game/phases";

const CATEGORY: Record<string, string> = { profanity: "욕설", personal_attack: "인신공격", mockery: "조롱·비하" };
const STATUS: Record<ModerationEntry["status"], string> = {
  flagged: "학생에게 수정 안내됨",
  pending_review: "선생님 확인 필요",
  approved: "공개함",
  returned: "다시 쓰도록 돌려보냄",
  withdrawn: "학생이 다시 씀",
};

/**
 * Teacher-only. Collapsed by default so a projected screen does not single anyone out.
 * The teacher decides; nobody is removed or labelled automatically.
 */
export default function ModerationPanel({ host, busy, onReview }: { host: HostState; busy: boolean; onReview: (entryId: string, decision: "approve" | "return") => void }) {
  const [open, setOpen] = useState(false);
  const pending = host.moderation.filter((e) => e.status === "pending_review");
  const entries = [...host.moderation].reverse();
  return (
    <section className={`panel moderation${pending.length ? " attention" : ""}`}>
      <button className="panel-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="moderation-toggle">
        <ShieldAlert size={18} aria-hidden />
        <span>
          표현 점검 기록 {host.moderation.length > 0 && <span className="pill">{host.moderation.length}</span>}
          {pending.length > 0 && <span className="pill warn">확인 필요 {pending.length}</span>}
        </span>
        <ChevronDown size={18} aria-hidden className={open ? "flip" : ""} />
      </button>
      {open && (
        <div className="moderation-body">
          <p className="muted small">학생 화면에는 보이지 않아요. 프로젝터로 화면을 띄울 때는 접어 두세요. AI가 연결되지 않으면 메시지는 선생님이 확인한 뒤에만 공개돼요.</p>
          {entries.length === 0 && <p className="muted">아직 점검에 걸린 메시지가 없어요.</p>}
          <ul>
            {entries.map((e) => (
              <li key={e.id} className={`entry status-${e.status}`} data-testid="moderation-entry">
                <div className="meta">
                  <strong>{e.nickname}</strong>
                  <span>{e.kind === "statement" ? "입장 발표" : KIND_LABELS[e.kind]}</span>
                  {e.category && <span className="pill warn">{CATEGORY[e.category]}</span>}
                  <span className="pill">{STATUS[e.status]}</span>
                </div>
                <p>{e.text}</p>
                {(e.status === "pending_review" || e.status === "flagged") && (
                  <div className="row">
                    <button className="button secondary small" disabled={busy} onClick={() => onReview(e.id, "approve")}>
                      {e.status === "flagged" ? "문제없음 · 그대로 공개" : "공개하기"}
                    </button>
                    {e.status === "pending_review" && (
                      <button className="button ghost small" disabled={busy} onClick={() => onReview(e.id, "return")}>
                        다시 쓰도록 돌려보내기
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
