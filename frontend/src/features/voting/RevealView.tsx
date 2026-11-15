import { VenetianMask } from "lucide-react";
import type { Participant, Reveal, Topic } from "../../types/game";
import { roleName } from "../roles/roleName";
import BlockAvatar, { lookOf } from "./BlockAvatar";

/** The class's result, said from the detectives' side. A tie names nobody, so nobody was found. */
const OUTCOME: Record<Reveal["outcome"], { text: string; win: boolean }> = {
  found: { text: "역할 전환자를 찾았어요!", win: true },
  partial: { text: "역할 전환자를 한 명만 찾았어요", win: true },
  missed: { text: "역할 전환자를 못 찾았어요", win: false },
  tie: { text: "역할 전환자를 못 찾았어요", win: false },
  no_votes: { text: "투표한 사람이 없어요", win: false },
};

/** My own result: a switcher hid or was found out; everyone else found them or not. */
export function headline(reveal: Reveal, myUid?: string) {
  if (myUid && reveal.switchers.some((s) => s.uid === myUid)) {
    const caught = reveal.topVoted.includes(myUid);
    return caught ? { text: "정체가 밝혀졌어요", win: false } : { text: "정체를 끝까지 숨겼어요!", win: true };
  }
  return OUTCOME[reveal.outcome];
}

function Headline({ reveal, myUid }: { reveal: Reveal; myUid?: string }) {
  const { text, win } = headline(reveal, myUid);
  return (
    <p className={`reveal-headline ${win ? "win" : "lose"}`} data-testid="reveal-headline">
      {text}
    </p>
  );
}

/** Shows who the switchers were and the votes. Preferences and who voted for whom are never shown. */
export default function RevealView({ reveal, participants, topic, myUid, compact = false }: { reveal: Reveal; participants: Participant[]; topic: Topic; myUid?: string; compact?: boolean }) {
  const name = (uid: string) => participants.find((p) => p.uid === uid)?.nickname ?? "나간 참가자";
  return (
    <div className={`reveal${compact ? " compact" : ""}`} data-testid="reveal">
      <Headline reveal={reveal} myUid={myUid} />
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
                  <em>{caught ? "정체가 밝혀졌어요" : "정체를 숨겼어요"}</em>
                </figcaption>
              </figure>
            );
          })}
        </div>
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
      <Headline reveal={reveal} />
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
