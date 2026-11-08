import { Check } from "lucide-react";
import type { Participant } from "../../types/game";

export function togglePick(current: string[], uid: string, count: number) {
  if (current.includes(uid)) return current.filter((x) => x !== uid);
  if (count === 1) return [uid];
  return current.length >= count ? [current[1], uid] : [...current, uid];
}

/**
 * Pick who the switcher is; the pick can change until time runs out, then it becomes the vote.
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
  if (myVote)
    return (
      <div className="vote-done" data-testid="vote-done">
        <Check size={20} aria-hidden /> <strong>{myVote.map(name).join(", ")}</strong>에게 투표했어요.
      </div>
    );
  const left = count - picked.length;
  return (
    <div className="vote-panel">
      <p className="vote-pointed" data-testid="vote-pointed">
        {picked.length ? (
          <>
            투표: <strong>{picked.map(name).join(", ")}</strong>
            {left > 0 && ` · ${left}명 더`}
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
