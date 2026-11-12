import { Check, MousePointer2 } from "lucide-react";
import type { Participant } from "../../types/game";

export function togglePick(current: string[], uid: string, count: number) {
  if (current.includes(uid)) return current.filter((x) => x !== uid);
  if (count === 1) return [uid];
  return current.length >= count ? [current[1], uid] : [...current, uid];
}

/**
 * Pick who the switcher is. Each full pick is my vote, and it can change until time runs out.
 * At the 3D table people are picked by pointing at them there; without it, by the buttons here.
 */
export default function VotePanel({
  candidates,
  count,
  myVote,
  disabled,
  picked,
  onPick,
  atTable = false,
}: {
  candidates: Participant[];
  count: number;
  myVote: string[] | null;
  disabled: boolean;
  picked: string[];
  onPick: (uid: string) => void;
  atTable?: boolean;
}) {
  const name = (uid: string) => candidates.find((c) => c.uid === uid)?.nickname;
  const saved = !!myVote && myVote.length === picked.length && picked.every((uid) => myVote.includes(uid));
  const left = count - picked.length;
  return (
    <div className="vote-panel">
      <div className="vote-instruction" role="status">
        <MousePointer2 size={24} aria-hidden />
        <div>
          <strong>의심되는 상대를 클릭해 투표해 주세요.</strong>
          <p>{count}명을 고르면 자동으로 투표돼요. 시간이 끝나기 전까지 바꿀 수 있어요.</p>
        </div>
      </div>
      <p className="vote-pointed" data-testid="vote-pointed">
        {picked.length ? (
          <>
            투표: <strong>{picked.map(name).join(", ")}</strong>
            {left > 0 && ` · ${left}명 더`}
            {saved && <Check size={18} aria-label="반영됨" className="vote-saved" data-testid="vote-done" />}
          </>
        ) : (
          "역할 전환자는 누구일까요?"
        )}
      </p>
      {!atTable && (
        <div className="candidates" role="group" aria-label="투표 후보">
          {candidates.map((p) => (
            <button key={p.uid} type="button" aria-pressed={picked.includes(p.uid)} disabled={disabled} className={`candidate${picked.includes(p.uid) ? " picked" : ""}`} onClick={() => onPick(p.uid)}>
              <strong>{p.nickname}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
