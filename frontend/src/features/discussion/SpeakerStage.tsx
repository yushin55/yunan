import { Check, Pause } from "lucide-react";
import type { Participant, Room } from "../../types/game";
import { formatSeconds, KIND_LABEL } from "../game/phases";
import { usePhaseTimer } from "../game/usePhaseTimer";
import { roleName } from "../roles/roleName";
import { useFloor } from "./floor";

/**
 * Who has the microphone, how long is left, and (during statements) the speaking order.
 * Big on the classroom screen; on the teacher's screen (`onCall`) a small line, so the controls lead.
 */
export default function SpeakerStage({ room, participants, offset, busy, onCall }: { room: Room; participants: Participant[]; offset: number; busy?: boolean; onCall?: (uid: string) => void }) {
  const compact = Boolean(onCall);
  const timer = usePhaseTimer(room, offset);
  const { floor, seconds } = useFloor(room, offset);
  // The Q&A after the statements is an open floor like the event phase: the last speaker no longer holds it.
  const turn = room.turn?.stage === "qa" ? null : room.turn;
  const person = (uid: string) => participants.find((p) => p.uid === uid);
  const speaker = person(floor?.uid ?? turn?.uid ?? "");
  // A turn runs on the turn's clock. On the open floor the phase clock is in the header, and this one is the speaker's.
  const qa = room.turn?.stage === "qa";
  // The Q&A runs on the turn clock, which the header hides while a turn exists; show it here while the microphone is free.
  const onTurnClock = Boolean(turn) || (qa && !floor);
  const clock = onTurnClock ? timer.label : floor ? formatSeconds(seconds) : "";
  const left = onTurnClock ? timer.remaining : seconds;
  const urgent = !timer.paused && left !== null && left <= 10;
  return (
    <section className={`speaker-stage${compact ? " compact" : ""}`} data-testid="speaker-stage">
      {compact ? (
        // Nothing to say while the microphone is free: the teacher's screen stays quiet.
        <div className="speaker-now">
          {speaker && (
            <p className="speaker-line">
              <span className="speaker-label">말하는 사람</span>
              <strong data-testid="current-speaker">{speaker.nickname}</strong>
              {speaker.roleId && <span className="speaker-role">{roleName(room.topic, speaker.roleId)}</span>}
              {floor && !turn && <span className="speaker-kind" data-testid="speaker-eyebrow">{KIND_LABEL[floor.kind]} 중</span>}
            </p>
          )}
        </div>
      ) : (
        <div className="speaker-now">
          {floor && !turn && (
            <span className="eyebrow" data-testid="speaker-eyebrow">
              지금 말하는 사람 · {KIND_LABEL[floor.kind]}
            </span>
          )}
          <h2 data-testid="current-speaker">{speaker?.nickname ?? (turn ? "나간 참가자" : "Z키를 눌러 발언해 주세요!")}</h2>
          {speaker?.roleId && <p className="speaker-role">{roleName(room.topic, speaker.roleId)}</p>}
        </div>
      )}
      {clock && (
        <div className={`speaker-timer${urgent ? " urgent" : ""}${timer.paused ? " paused" : ""}`} role="timer" aria-label={`남은 시간 ${clock}`}>
          {timer.paused && <Pause size={22} aria-hidden />}
          <strong>{clock}</strong>
        </div>
      )}
      {turn && (
        <ol className="speaker-queue" aria-label="말하는 순서">
          {turn.order.map((uid, i) => {
            const p = person(uid);
            const state = i < turn.index ? "done" : i === turn.index ? "current" : i === turn.index + 1 ? "next" : "waiting";
            const label = (
              <>
                {state === "done" && <Check size={13} aria-hidden />} {p?.nickname}
                {state === "next" && <small className="queue-next">다음</small>}
              </>
            );
            return (
              <li key={`${uid}.${i}`} className={state}>
                {/* Only someone still waiting can be called; they speak right after the current speaker. */}
                {onCall && state === "waiting" ? (
                  <button disabled={busy} data-testid="call-speaker" title={`${p?.nickname}을(를) 다음 차례로`} onClick={() => onCall(uid)}>
                    {label}
                  </button>
                ) : (
                  <span>{label}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
