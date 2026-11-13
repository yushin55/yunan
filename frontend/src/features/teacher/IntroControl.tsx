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
const NEXT: Record<IntroStep, { step: IntroStep; label: string } | null> = {
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
 * `preview`: practice, where only this screen follows the steps and the student screen keeps its own pace.
 */
export default function IntroControl({
  intro,
  room,
  participants,
  offset,
  busy,
  onStep,
  onMove,
  preview = false,
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
      <p className="muted small intro-note">
        {preview
          ? "연습용 미리보기예요. 실제 방에서는 선생님이 영상을 넘기거나 멈추면 학생 화면도 같이 따라가고, 학생은 영상을 건너뛸 수 없어요. 실제 보도 요약이니 수업 전에 출처를 확인해 주세요."
          : "선생님이 영상을 건너뛰거나 원하는 지점으로 옮기거나 멈추면 학생 화면도 같은 장면으로 따라가요. 학생은 건너뛸 수 없어요. 실제 보도 요약이니 수업 전에 출처를 확인해 주세요."}
      </p>
      {intro.step === "briefing" && (
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
      {intro.step === "rules" && (
        <div className="video-fit">
          <RulesVideo key={introRun(intro)} startAt={introElapsed(intro, offset)} startPaused={intro.pausedAt != null} onControl={onMove} onNext={() => go("roles")} nextLabel="역할 고르기 시작" />
        </div>
      )}
      {intro.step === "waiting" && <p className="intro-state">학생들은 대기 화면에 있어요. 모두 들어오면 위의 ‘이슈 브리핑 영상 시작’을 눌러 주세요.</p>}
      {intro.step === "roles" && (
        <p className="intro-state">
          학생들이 역할을 고르고 있어요 · {picked}/{participants.length}명 완료.{" "}
          {preview ? "연습에서는 위의 ‘학생 화면으로’를 눌러 내 역할을 고르면 게임이 시작돼요." : "모두 고르면 위의 ‘게임 시작’을 눌러 주세요."}
        </p>
      )}
    </section>
  );
}
