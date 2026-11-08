import { VenetianMask } from "lucide-react";
import type { Participant, Reveal, Topic } from "../../types/game";
import { roleName } from "../roles/roleName";
import BlockAvatar, { lookOf } from "./BlockAvatar";

const OUTCOME: Record<Reveal["outcome"], string> = {
  found: "역할 전환자를 찾아냈어요!",
  partial: "역할 전환자 중 한 명만 찾아냈어요",
  missed: "역할 전환자가 들키지 않았어요",
  tie: "득표가 동률이에요",
  no_votes: "투표한 사람이 없어요",
};

/** Shows who the switchers were and the votes. Preferences and who voted for whom are never shown. */
export default function RevealView({ reveal, participants, topic, myUid }: { reveal: Reveal; participants: Participant[]; topic: Topic; myUid?: string }) {
  const name = (uid: string) => participants.find((p) => p.uid === uid)?.nickname ?? "나간 참가자";
  const outcome = OUTCOME[reveal.outcome];
  return (
    <div className="reveal" data-testid="reveal">
      <div className="reveal-hero">
        <span className="eyebrow">역할 전환자</span>
        <div className="reveal-switchers">
          {reveal.switchers.map((sw) => {
            const caught = reveal.topVoted.includes(sw.uid);
            return (
              <figure key={sw.uid} className={`reveal-switcher ${caught ? "caught" : "escaped"}`} data-testid="reveal-switcher">
                <BlockAvatar {...lookOf(participants, sw.uid, myUid)} mood={caught ? "slump" : "cheer"} />
                <figcaption>
                  <strong>{sw.uid === myUid ? "나" : name(sw.uid)}</strong>
                  <span>{roleName(topic, sw.roleId)}</span>
                  <em>{caught ? "들켜 버렸어요…" : "끝까지 들키지 않았어요!"}</em>
                </figcaption>
              </figure>
            );
          })}
        </div>
        <p className="reveal-outcome">{outcome}</p>
      </div>
      <h3>득표 결과</h3>
      <Tally reveal={reveal} participants={participants} />
    </div>
  );
}

function Tally({ reveal, participants }: { reveal: Reveal; participants: Participant[] }) {
  const name = (uid: string) => participants.find((p) => p.uid === uid)?.nickname ?? "나간 참가자";
  const max = Math.max(1, ...reveal.tally.map((t) => t.votes));
  const switcherIds = new Set(reveal.switchers.map((s) => s.uid));
  return (
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
  );
}

/** For the teacher and the classroom screen: who the switcher was and the votes, nothing more. */
export function RevealSummary({ reveal, participants, topic }: { reveal: Reveal; participants: Participant[]; topic: Topic }) {
  const name = (uid: string) => participants.find((p) => p.uid === uid)?.nickname ?? "나간 참가자";
  return (
    <div className="reveal-summary" data-testid="reveal">
      <p className="reveal-summary-who">
        <VenetianMask size={20} aria-hidden /> 역할 전환자:{" "}
        {reveal.switchers.map((s, i) => (
          <strong key={s.uid}>
            {i > 0 && ", "}
            {name(s.uid)} ({roleName(topic, s.roleId)})
          </strong>
        ))}
      </p>
      <Tally reveal={reveal} participants={participants} />
    </div>
  );
}
