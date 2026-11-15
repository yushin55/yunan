import IssueBriefing from "../briefing/IssueBriefing";
import RulesVideo from "../briefing/RulesVideo";
import { introElapsed, introRun } from "../briefing/intro";
import type { Intro, IntroStep, Participant, Room } from "../../types/game";

const STEPS: { step: IntroStep; label: string }[] = [
  { step: "waiting", label: "대기" },
  { step: "briefing", label: "이슈 브리핑" },
  { step: "rules", label: "게임 규칙" },
  { step: "roles", label: "역할 고르기" },
];
export const NEXT: Record<IntroStep, { step: IntroStep; label: string } | null> = {
  waiting: { step: "briefing", label: "이슈 브리핑 영상 시작" },
  briefing: { step: "rules", label: "다음: 게임 규칙 영상 시작" },
  rules: { step: "roles", label: "다음: 역할 고르기 시작" },
  roles: null,
};

/**
 * Before the game the teacher runs the videos for the whole class: every student's screen plays the
 * same video from the same moment, and nobody moves on until the teacher does. The teacher's own
 * copy plays in step, so it can go on the projector too; its end card moves the class on, even in full screen.
 * The teacher's copy keeps every control (seek, scenes, pause, skip) and each move takes the class's screens along.
 * `preview`: practice, where only this screen follows the steps and the student screen keeps its own pace (no longer changes the view).
 */
export default function IntroControl({
  intro,
  room,
  participants,
  offset,
  busy,
  onStep,
  onMove,
  hideVideo = false,
}: {
  intro: Intro;
  room: Room;
  participants: Participant[];
  offset: number;
  busy: boolean;
  onStep: (step: IntroStep) => void;
  /** The teacher moved within the playing video: seconds in, and whether it is paused. */
  onMove: (at: number, paused: boolean) => void;
  preview?: boolean;
  /** The classroom screen is up and plays the same video: this copy steps aside so the sound is not doubled. */
  hideVideo?: boolean;
}) {
  const next = NEXT[intro.step];
  const picked = participants.filter((p) => p.prefsDone).length;
  const go = (step: IntroStep) => {
    if (!busy) onStep(step);
  };
  return (
    <section className="panel intro-control view-fill" data-testid="intro-control">
      <div className="intro-head">
        <ol className="intro-steps" aria-label="진행 단계">
          {STEPS.map(({ step, label }) => (
            <li key={step}>
              <button
                className={`intro-step${intro.step === step ? " current" : ""}`}
                aria-current={intro.step === step ? "step" : undefined}
                data-testid={`intro-step-${step}`}
                disabled={busy}
                onClick={() => onStep(step)}
                title={step === "briefing" || step === "rules" ? "누르면 처음부터 다시 틀어요" : undefined}
              >
                {label}
              </button>
            </li>
          ))}
        </ol>
        {next && (
          <button className="button primary" data-testid="intro-next" disabled={busy} onClick={() => onStep(next.step)}>
            {next.label}
          </button>
        )}
      </div>
      {!hideVideo && intro.step === "briefing" && (
        <div className="video-fit">
          <IssueBriefing
            key={introRun(intro)}
            briefing={room.topic.briefing}
            topicId={room.topicId}
            headline={room.topic.shortTitle}
            startAt={introElapsed(intro, offset)}
            startPaused={intro.pausedAt != null}
            onControl={onMove}
            onNext={() => go("rules")}
            nextLabel="게임 규칙 영상 시작"
          />
        </div>
      )}
      {!hideVideo && intro.step === "rules" && (
        <div className="video-fit">
          <RulesVideo key={introRun(intro)} startAt={introElapsed(intro, offset)} startPaused={intro.pausedAt != null} onControl={onMove} onNext={() => go("roles")} nextLabel="역할 고르기 시작" />
        </div>
      )}
      {intro.step === "roles" && (
        <p className="intro-state">
          역할 고르기 {picked}/{participants.length}명
        </p>
      )}
    </section>
  );
}
