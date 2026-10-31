import { Equal, Search, VenetianMask } from "lucide-react";
import type { Participant, Reveal, Topic } from "../../types/game";
import { roleName } from "../chat/ChatFeed";

const OUTCOME: Record<Reveal["outcome"], { title: string; text: string }> = {
  found: { title: "역할 전환자를 찾아냈어요!", text: "가장 많은 표를 받은 사람이 역할 전환자였어요." },
  partial: { title: "역할 전환자 중 한 명만 찾아냈어요", text: "가장 많은 표를 받은 두 사람 중 한 명이 역할 전환자였어요." },
  missed: { title: "역할 전환자가 들키지 않았어요", text: "가장 많은 표를 받은 사람은 역할 전환자가 아니었어요." },
  tie: { title: "득표가 동률이에요", text: "최다 득표자를 한 명으로 정할 수 없어서, 결과를 동률로 보여 줘요." },
  no_votes: { title: "투표한 사람이 없어요", text: "시간 안에 들어온 표가 없어 최다 득표자가 없어요." },
};

/** Shows who the switchers were and how everyone guessed. Preferences are never shown. */
export default function RevealView({ reveal, participants, topic, myUid }: { reveal: Reveal; participants: Participant[]; topic: Topic; myUid?: string }) {
  const name = (uid: string) => participants.find((p) => p.uid === uid)?.nickname ?? "나간 참가자";
  const max = Math.max(1, ...reveal.tally.map((t) => t.votes));
  const switcherIds = new Set(reveal.switchers.map((s) => s.uid));
  const mine = reveal.ballots.find((b) => b.uid === myUid);
  const outcome = OUTCOME[reveal.outcome];
  return (
    <div className="reveal" data-testid="reveal">
      <div className="reveal-hero">
        <VenetianMask size={30} aria-hidden />
        <span className="eyebrow">역할 전환자는</span>
        {reveal.switchers.map((s) => (
          <div key={s.uid} className="switcher-name">
            <strong>{name(s.uid)}</strong>
            <span>{roleName(topic, s.roleId)} 역할을 맡았어요</span>
          </div>
        ))}
      </div>
      <div className={`outcome outcome-${reveal.outcome}`}>
        {reveal.outcome === "tie" ? <Equal size={20} aria-hidden /> : <Search size={20} aria-hidden />}
        <div>
          <strong>{outcome.title}</strong>
          <span>{outcome.text}</span>
          {reveal.tie && reveal.tiedUids.length > 0 && (
            <span>
              동률: {reveal.tiedUids.map(name).join(", ")}
              {reveal.topVoted.length > 0 && ` (확실한 최다 득표: ${reveal.topVoted.map(name).join(", ")})`}
            </span>
          )}
        </div>
      </div>
      {mine && (
        <p className="my-guess">
          {!mine.voted
            ? "나는 투표하지 않았어요."
            : mine.correct === reveal.switcherCount
              ? "내 추리: 정답이에요!"
              : mine.correct > 0
                ? `내 추리: ${reveal.switcherCount}명 중 ${mine.correct}명을 맞혔어요.`
                : "내 추리: 아쉽게도 빗나갔어요."}
        </p>
      )}
      <h3>득표 결과</h3>
      <ul className="tally">
        {reveal.tally.map((row) => (
          <li key={row.uid} className={switcherIds.has(row.uid) ? "is-switcher" : ""}>
            <span className="who">
              {name(row.uid)}
              {switcherIds.has(row.uid) && <em>역할 전환자</em>}
            </span>
            <span className="bar">
              <i style={{ width: `${(row.votes / max) * 100}%` }} />
            </span>
            <span className="votes">{row.votes}표</span>
          </li>
        ))}
      </ul>
      <h3>각자의 추리</h3>
      <ul className="ballots">
        {reveal.ballots.map((b) => (
          <li key={b.uid}>
            <strong>{name(b.uid)}</strong>
            <span>{b.voted ? `→ ${b.targets.map(name).join(", ")}` : "투표하지 않음"}</span>
            {b.voted && <em className={b.correct ? "hit" : "miss"}>{b.correct ? (reveal.switcherCount === 1 ? "맞힘" : `${b.correct}명 맞힘`) : "빗나감"}</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}
