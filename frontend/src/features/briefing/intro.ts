import type { Intro } from "../../types/game";

/** Seconds into the video where the class is now, by the server's clock (or where the teacher paused it). */
export function introElapsed(intro: Intro, offset: number) {
  if (intro.pausedAt != null) return intro.pausedAt;
  return intro.startedAt ? Math.max(0, (Date.now() + offset - intro.startedAt) / 1000) : 0;
}

/** Students' players restart whenever the teacher starts, seeks or pauses the video. */
export const introKey = (intro: Intro) => `${intro.startedAt}:${intro.pausedAt ?? ""}`;

/** The teacher's own player restarts only when a step is (re)started, not for its own seeks and pauses. */
export const introRun = (intro: Intro) => `${intro.step}:${intro.run ?? intro.startedAt}`;
