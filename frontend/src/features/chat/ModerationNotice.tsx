import { Hourglass, PencilLine, ShieldCheck } from "lucide-react";
import type { ModerationResult, Notice } from "../../types/game";

/** Shown to the author only; nothing about it reaches other students. */
export default function ModerationNotice({ notice, onEdit }: { notice: Notice | ModerationResult | null; onEdit?: (text: string) => void }) {
  if (!notice) return null;
  const text = "text" in notice ? notice.text : undefined;
  if (notice.status === "needs_edit")
    return (
      <div className="notice warn" role="alert" data-testid="moderation-notice">
        <PencilLine size={18} aria-hidden />
        <div>
          <strong>보내기 전에 표현을 다듬어 주세요</strong>
          <span>{notice.hint}</span>
          {notice.excerpt && (
            <span className="excerpt">
              고칠 부분: <mark>{notice.excerpt}</mark>
            </span>
          )}
          <small>이 안내는 나에게만 보여요. 반대 의견이나 반론은 괜찮아요.</small>
        </div>
      </div>
    );
  if (notice.status === "pending_review")
    return (
      <div className="notice info" role="status" data-testid="moderation-notice">
        <Hourglass size={18} aria-hidden />
        <div>
          <strong>선생님이 확인한 뒤 공개돼요</strong>
          <span>지금은 자동 점검을 할 수 없어서 선생님이 먼저 읽어 볼 거예요.</span>
        </div>
      </div>
    );
  if (notice.status === "returned")
    return (
      <div className="notice warn" role="alert" data-testid="moderation-notice">
        <PencilLine size={18} aria-hidden />
        <div>
          <strong>선생님이 표현을 다시 다듬어 달라고 했어요</strong>
          <span>뜻은 그대로 두고, 사람이 아니라 주장이나 이유에 대해 말해 보세요.</span>
          {text && onEdit && (
            <button className="button ghost small" onClick={() => onEdit(text)}>
              보냈던 글 다시 불러오기
            </button>
          )}
        </div>
      </div>
    );
  if (notice.status === "approved")
    return (
      <div className="notice ok" role="status">
        <ShieldCheck size={18} aria-hidden />
        <div>
          <strong>선생님 확인 후 공개되었어요</strong>
        </div>
      </div>
    );
  return null;
}
