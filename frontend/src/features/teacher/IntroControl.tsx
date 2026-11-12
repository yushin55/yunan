import IssueBriefing from "../briefing/IssueBriefing";
import RulesVideo from "../briefing/RulesVideo";
import { introElapsed } from "../briefing/intro";
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
 * copy plays in step, so it can go on the projector too.
 */
export default function IntroControl({ intro, room, participants, offset, busy, onStep }: { intro: Intro; room: Room; participants: Participant[]; offset: number; busy: boolean; onStep: (step: IntroStep) => void }) {
  const next = NEXT[intro.step];
  const picked = participants.filter((p) => p.prefsDone).length;
  return (
    <section className="panel intro-control" data-testid="intro-control">
      <h3>시작 전 영상</h3>
      <p className="muted small">학생 화면은 선생님이 고른 단계를 함께 보여 줘요. 영상은 모두 같은 장면부터 재생되고, 학생은 건너뛸 수 없어요. 실제 보도 요약이니 수업 전에 출처를 확인해 주세요.</p>
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
      {intro.step === "briefing" && <IssueBriefing key={intro.startedAt} briefing={room.topic.briefing} topicId={room.topicId} headline={room.topic.shortTitle} startAt={introElapsed(intro, offset)} />}
      {intro.step === "rules" && <RulesVideo key={intro.startedAt} startAt={introElapsed(intro, offset)} />}
      {intro.step === "waiting" && <p className="intro-state">학생들은 대기 화면에 있어요. 모두 들어오면 영상을 시작해 주세요.</p>}
      {intro.step === "roles" && (
        <p className="intro-state">
          학생들이 역할을 고르고 있어요 · {picked}/{participants.length}명 완료
        </p>
      )}
      {next && (
        <button className="button primary large" data-testid="intro-next" disabled={busy} onClick={() => onStep(next.step)}>
          {next.label}
        </button>
      )}
    </section>
  );
}
