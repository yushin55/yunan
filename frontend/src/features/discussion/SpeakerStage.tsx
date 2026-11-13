import { Check, Pause } from "lucide-react";
import type { Participant, Room } from "../../types/game";
import { formatSeconds, KIND_LABEL } from "../game/phases";
import { usePhaseTimer } from "../game/usePhaseTimer";
import { roleName } from "../roles/roleName";
import { useFloor } from "./floor";

/** The shared screen's centre: who has the microphone, how long is left, and (during statements) who is next. */
export default function SpeakerStage({ room, participants, offset, busy, onCall }: { room: Room; participants: Participant[]; offset: number; busy?: boolean; onCall?: (uid: string) => void }) {
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
    <section className="speaker-stage" data-testid="speaker-stage">
      <div className="speaker-now">
        <span className="eyebrow" data-testid="speaker-eyebrow">
          {turn ? `입장 발표 · ${turn.index + 1}/${turn.order.length}번째${floor ? " · 마이크 켜짐" : ""}` : floor ? `지금 말하는 사람 · ${KIND_LABEL[floor.kind]}` : qa ? "질문 시간 · 마이크가 비어 있어요" : "마이크가 비어 있어요"}
        </span>
        <h2 data-testid="current-speaker">{speaker?.nickname ?? (turn ? "나간 참가자" : "먼저 누르는 사람이 말해요")}</h2>
        {speaker?.roleId && <p className="speaker-role">{roleName(room.topic, speaker.roleId)}</p>}
      </div>
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
            const state = i < turn.index ? "done" : i === turn.index ? "current" : "waiting";
            const label = (
              <>
                {state === "done" && <Check size={13} aria-hidden />} {p?.nickname}
              </>
            );
            return (
              <li key={`${uid}.${i}`} className={state}>
                {onCall && state !== "current" ? (
                  <button disabled={busy} data-testid="call-speaker" title={`${p?.nickname}에게 ${state === "done" ? "다시" : "바로"} 차례 주기`} onClick={() => onCall(uid)}>
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
