// Practice partners speak from their role card. A switcher plays a role they did not pick,
// so their lines stay vaguer — the clue the player can use when voting.
import type { EventCard, Role } from "../../types/game";
import { pick, type Rng } from "./rules";

const strip = (s: string) => s.replace(/[.。]\s*$/, "");

export function statementLine(role: Role, switcher: boolean, rng: Rng) {
  if (switcher)
    return pick(
      [
        `음… 저는 ${role.name}로서, 이 문제는 여러 의견을 잘 들어 보고 정하는 게 좋다고 생각해요.`,
        `${role.name} 입장에서 보면, 너무 한쪽으로 정하지 않는 게 중요할 것 같아요.`,
      ],
      rng,
    );
  return pick(
    [
      `저는 ${role.name}입니다. 제 목표는 ‘${strip(role.goal)}’입니다. 특히 ‘${strip(role.concerns[0])}’라는 점을 꼭 고려해야 한다고 생각해요.`,
      `${role.name}로서 말하자면, ‘${strip(role.concerns[0])}’라는 걱정이 커요. 그래서 ‘${strip(role.goal)}’ 쪽으로 정해야 한다고 봅니다.`,
    ],
    rng,
  );
}

/**
 * Practice has no AI: the one-line summary of a partner's statement comes from the same card the
 * line was made from. The player's own words are cut at a pause instead.
 * ponytail: stand-in for the server's AI summary (backend discussion.py, `statements`).
 */
export function statementGist(role: Role | undefined, switcher: boolean, said: string) {
  if (role) return switcher ? "한쪽으로 정하기보다 여러 의견을 듣고 신중히 정하자" : strip(role.goal);
  const first = said.split(/(?<=[.!?])\s+/)[0].trim();
  if (first.length <= 45) return first;
  const pause = first.slice(0, 45).lastIndexOf(",");
  return (pause > 10 ? first.slice(0, pause) : first.slice(0, 45).replace(/\s+\S*$/, "")).trim();
}

export function responseLine(role: Role, event: EventCard, switcher: boolean, rng: Rng) {
  // A switcher never saw the event card: they can only go along with what others said about it.
  if (switcher)
    return pick(["저도 다른 분들이랑 비슷하게 생각해요. 신중하게 정하면 좋겠어요.", "그런 일은 상황마다 달라서… 방금 말씀하신 걸 좀 더 들어 볼게요."], rng);
  const concern = strip(role.concerns[role.concerns.length > 1 ? 1 : 0]);
  return pick(
    [
      `‘${event.title}’ 상황이라면, ${role.name}로서는 ‘${concern}’라는 점부터 챙겨야 한다고 봐요.`,
      `이번 사건을 보니 제 걱정이 더 커졌어요. ‘${concern}’ — 이걸 해결하는 규칙이 먼저 필요해요.`,
    ],
    rng,
  );
}

/** The last reasoning: whom this partner suspects, and why. */
export function opinionLine(suspect: string, rng: Rng) {
  return pick(
    [
      `저는 ${suspect}님이 좀 의심돼요. 입장 발표가 너무 두루뭉술했거든요.`,
      `${suspect}님이 역할 전환자 같아요. 사건 이야기를 할 때 내용을 잘 모르는 것 같았어요.`,
      `${suspect}님은 자기 역할의 걱정을 한 번도 구체적으로 말하지 않았어요. 그래서 의심돼요.`,
    ],
    rng,
  );
}

/** Answering a suspicion in the last reasoning. */
export function defenseLine(role: Role, switcher: boolean, rng: Rng) {
  if (switcher) return pick(["음… 저도 제 역할대로 말했는데요. 다른 분이 더 수상해 보여요.", "사건 이야기는 다들 비슷하게 하지 않았나요? 저는 아니에요."], rng);
  return pick([`저는 처음부터 ${role.name} 입장에서 ‘${strip(role.concerns[0])}’를 말했어요. 저는 아니에요.`, `사건 카드를 보고 ${role.name}로서 바로 답했잖아요. 다시 한번 생각해 보세요.`], rng);
}

export function answerLine(role: Role, switcher: boolean, rng: Rng) {
  if (switcher) return pick(["음, 그건 상황에 따라 다를 것 같아요. 좀 더 생각해 볼게요.", "좋은 질문이네요. 저도 딱 잘라 말하긴 어려워요."], rng);
  return pick(
    [
      `제 입장에서는 ‘${strip(role.goal)}’라는 목표가 제일 중요해서, 그 기준으로 판단하고 싶어요.`,
      `${role.name}로서는 ‘${strip(role.concerns[0])}’라는 걱정 때문에 그렇게 생각해요.`,
    ],
    rng,
  );
}
