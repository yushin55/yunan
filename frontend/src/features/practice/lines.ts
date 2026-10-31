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

export function responseLine(role: Role, event: EventCard, switcher: boolean, rng: Rng) {
  if (switcher)
    return pick(["저도 다른 분들이랑 비슷하게 생각해요. 신중하게 정하면 좋겠어요.", `‘${event.title}’ 같은 일은 상황마다 달라서… 일단 더 들어 볼게요.`], rng);
  const concern = strip(role.concerns[role.concerns.length > 1 ? 1 : 0]);
  return pick(
    [
      `‘${event.title}’ 상황이라면, ${role.name}로서는 ‘${concern}’라는 점부터 챙겨야 한다고 봐요.`,
      `이번 사건을 보니 제 걱정이 더 커졌어요. ‘${concern}’ — 이걸 해결하는 규칙이 먼저 필요해요.`,
    ],
    rng,
  );
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

export function rebuttalLine(role: Role, targetName: string, targetRole: Role | undefined, switcher: boolean, rng: Rng) {
  if (switcher) return `${targetName}님 말도 맞는 것 같은데… 저는 그래도 조금 다르게 봐요.`;
  const theirs = targetRole ? strip(targetRole.concerns[0]) : "그 걱정";
  return pick(
    [
      `${targetName}님이 말한 ‘${theirs}’는 이해해요. 하지만 저는 ‘${strip(role.concerns[0])}’라는 점도 함께 봐야 한다고 생각해요.`,
      `${targetName}님 의견에는 동의하기 어려워요. ${role.name}로서는 ‘${strip(role.goal)}’가 더 우선이에요.`,
    ],
    rng,
  );
}
