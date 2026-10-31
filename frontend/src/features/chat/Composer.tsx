import { useState } from "react";
import { Lightbulb, Send } from "lucide-react";
import type { MessageKind, ModerationResult, Notice, Participant, Phase } from "../../types/game";
import { CHAT_KINDS, KIND_LABELS } from "../game/phases";
import ModerationNotice from "./ModerationNotice";

const PLACEHOLDER: Record<MessageKind, string> = {
  response: "제 역할로서 이 사건에는 … 라고 대응하고 싶어요. 왜냐하면 …",
  question: "진짜 그렇게 생각하세요? … 라면 어떻게 할 건가요?",
  answer: "그 질문에 답하자면, 제 역할에게는 … 가 중요해요.",
  rebuttal: "… 라는 걱정은 이해하지만, … 때문에 동의하기 어려워요.",
};

export default function Composer({
  phase,
  others,
  prompts,
  limit,
  busy,
  disabled,
  notice,
  onSend,
  target: controlledTarget,
  onTargetChange,
}: {
  phase: Phase;
  others: Participant[];
  prompts: string[];
  limit: number;
  busy: boolean;
  disabled: boolean;
  notice: Notice | ModerationResult | null;
  onSend: (kind: MessageKind, text: string, targetUid: string | null) => Promise<ModerationResult | null>;
  /** Optional: the recipient picked elsewhere (e.g. by tapping someone at the table). */
  target?: string;
  onTargetChange?: (uid: string) => void;
}) {
  const kinds = CHAT_KINDS[phase] ?? [];
  const [kind, setKind] = useState<MessageKind>(kinds[0]);
  const [text, setText] = useState("");
  const [ownTarget, setOwnTarget] = useState("");
  const target = controlledTarget ?? ownTarget;
  const setTarget = onTargetChange ?? setOwnTarget;
  const [showPrompts, setShowPrompts] = useState(false);
  const active = kinds.includes(kind) ? kind : kinds[0];

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await onSend(active, text.trim(), target || null);
    // Keep the draft when the wording must change, so the student can revise it.
    // The recipient stays selected so a back-and-forth can continue.
    if (result && result.status !== "needs_edit") setText("");
  };

  return (
    <form className="composer" onSubmit={send}>
      <div className="kind-tabs" role="radiogroup" aria-label="발언 종류">
        {kinds.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={active === k} className={active === k ? "active" : ""} onClick={() => setKind(k)}>
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <label className="target">
        <span>누구에게?</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="받는 사람">
          <option value="">모두에게</option>
          {others.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.nickname}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={limit}
        rows={3}
        placeholder={PLACEHOLDER[active]}
        aria-label={`${KIND_LABELS[active]} 입력`}
        disabled={disabled}
      />
      <ModerationNotice notice={notice} onEdit={setText} />
      <div className="composer-foot">
        <button type="button" className="button ghost small" onClick={() => setShowPrompts((v) => !v)}>
          <Lightbulb size={15} /> 질문 예시
        </button>
        <span className="count">
          {text.length}/{limit}
        </span>
        <button className="button primary" type="submit" disabled={busy || disabled || !text.trim()}>
          <Send size={16} /> 보내기
        </button>
      </div>
      {showPrompts && (
        <ul className="prompt-list">
          {prompts.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => {
                  setKind("question");
                  setText(p);
                  setShowPrompts(false);
                }}
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
