import { Check, Vote } from "lucide-react";
import type { Participant, Topic } from "../../types/game";
import { roleName } from "../roles/roleName";

export function togglePick(current: string[], uid: string, count: number) {
  if (current.includes(uid)) return current.filter((x) => x !== uid);
  if (count === 1) return [uid];
  return current.length >= count ? [current[1], uid] : [...current, uid];
}

export default function VotePanel({
  candidates,
  topic,
  count,
  myVote,
  busy,
  disabled,
  onVote,
  picked,
  onPick,
  atTable = false,
}: {
  candidates: Participant[];
  topic: Topic;
  count: number;
  myVote: string[] | null;
  busy: boolean;
  disabled: boolean;
  onVote: (targets: string[]) => void;
  picked: string[];
  onPick: (picked: string[]) => void;
  /** With the 3D table on, people are picked by pointing at them there instead of with buttons. */
  atTable?: boolean;
}) {
  if (myVote) {
    const names = myVote.map((uid) => candidates.find((c) => c.uid === uid)?.nickname).join(", ");
    return (
      <div className="vote-done" data-testid="vote-done">
        <Check size={20} aria-hidden /> <strong>{names}</strong>에게 투표했어요. 모두 투표하거나 시간이 끝나면 결과가 공개돼요.
      </div>
    );
  }
  const toggle = (uid: string) => onPick(togglePick(picked, uid, count));
  return (
    <div className="vote-panel">
      <p className="muted">
        {count === 1 ? "역할 전환자라고 생각하는 사람 1명을 고르세요." : "역할 전환자라고 생각하는 서로 다른 2명을 고르세요."} 나 자신에게는 투표할 수 없어요.
      </p>
      {atTable ? (
        <p className="vote-pointed" data-testid="vote-pointed">
          {picked.length ? (
            <>
              가리킨 사람: <strong>{picked.map((uid) => candidates.find((c) => c.uid === uid)?.nickname).join(", ")}</strong>
            </>
          ) : (
            "테이블에서 의심 가는 사람을 눌러 가리켜 주세요. 다시 누르면 취소돼요."
          )}
        </p>
      ) : (
      <div className="candidates" role="group" aria-label="투표 후보">
        {candidates.map((p) => (
          <button
            key={p.uid}
            type="button"
            aria-pressed={picked.includes(p.uid)}
            className={`candidate${picked.includes(p.uid) ? " picked" : ""}`}
            onClick={() => toggle(p.uid)}
          >
            <strong>{p.nickname}</strong>
            <span>{roleName(topic, p.roleId)}</span>
            {picked.includes(p.uid) && <Check size={18} aria-hidden />}
          </button>
        ))}
      </div>
      )}
      <button className="button primary full" disabled={busy || disabled || picked.length !== count} onClick={() => onVote(picked)}>
        <Vote size={17} /> {picked.length === count ? "이대로 투표하기" : `${count - picked.length}명 더 골라 주세요`}
      </button>
    </div>
  );
}
