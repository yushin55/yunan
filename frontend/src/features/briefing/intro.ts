import type { Intro } from "../../types/game";

/** Seconds since the teacher started this step, by the server's clock: where everyone's video is now. */
export function introElapsed(intro: Intro, offset: number) {
  return intro.startedAt ? Math.max(0, (Date.now() + offset - intro.startedAt) / 1000) : 0;
}
