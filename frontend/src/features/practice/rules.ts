// Offline copies of the server rules for the practice mode only. The real game always
// runs these on the server (backend/app/services/role_assignment.py, voting.py, moderation.py).
import type { Reveal } from "../../types/game";

export type Rng = () => number;
export const pick = <T,>(items: T[], rng: Rng) => items[Math.floor(rng() * items.length)];
export function shuffle<T>(items: T[], rng: Rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface Assigned {
  roleId: string;
  isSwitcher: boolean;
  preferenceRank: 1 | 2 | null;
}

/** Same rules as the server: switchers come from the most chosen first preference. */
export function assignRoles(roleIds: string[], prefs: Record<string, [string, string]>, switcherCount: number, rng: Rng) {
  const counts = new Map<string, number>();
  for (const [first] of Object.values(prefs)) counts.set(first, (counts.get(first) ?? 0) + 1);
  const most = Math.max(...counts.values());
  const tied = [...counts.keys()].filter((role) => counts.get(role) === most).sort();
  const topRole = pick(tied, rng);
  const candidates = Object.keys(prefs).filter((uid) => prefs[uid][0] === topRole);
  if (candidates.length < switcherCount) throw new Error("not_enough_candidates");
  const switchers = shuffle(candidates, rng).slice(0, switcherCount);
  const result: Record<string, Assigned> = {};
  for (const uid of switchers) {
    const options = roleIds.filter((role) => !prefs[uid].includes(role));
    result[uid] = { roleId: pick(options, rng), isSwitcher: true, preferenceRank: null };
  }
  const load = new Map<string, number>();
  for (const a of Object.values(result)) load.set(a.roleId, (load.get(a.roleId) ?? 0) + 1);
  for (const uid of shuffle(Object.keys(prefs).filter((u) => !(u in result)), rng)) {
    const [first, second] = prefs[uid];
    const useFirst = (load.get(first) ?? 0) <= (load.get(second) ?? 0);
    const roleId = useFirst ? first : second;
    load.set(roleId, (load.get(roleId) ?? 0) + 1);
    result[uid] = { roleId, isSwitcher: false, preferenceRank: useFirst ? 1 : 2 };
  }
  return result;
}

export function buildReveal(uids: string[], assigned: Record<string, Assigned>, votes: Record<string, string[]>, k: number): Reveal {
  const switchers = uids.filter((uid) => assigned[uid].isSwitcher);
  const tally = Object.fromEntries(uids.map((uid) => [uid, 0]));
  for (const targets of Object.values(votes)) for (const t of targets) tally[t] += 1;
  const counts = Object.values(tally).sort((a, b) => b - a);
  const boundary = counts[k - 1] ?? 0;
  const above = uids.filter((uid) => tally[uid] > boundary);
  const at = uids.filter((uid) => tally[uid] === boundary);
  const clean = boundary > 0 && above.length + at.length === k;
  const topVoted = clean ? [...above, ...at] : above;
  const tie = topVoted.length < k;
  const caught = switchers.filter((uid) => topVoted.includes(uid));
  const outcome: Reveal["outcome"] = !Object.keys(votes).length ? "no_votes" : tie ? "tie" : caught.length === k ? "found" : caught.length ? "partial" : "missed";
  return {
    switcherCount: k,
    switchers: switchers.map((uid) => ({ uid, roleId: assigned[uid].roleId })),
    tally: uids.map((uid) => ({ uid, votes: tally[uid] })).sort((a, b) => b.votes - a.votes),
    topVoted,
    tiedUids: clean || boundary === 0 ? [] : at,
    tie,
    outcome,
    ballots: uids.map((uid) => {
      const targets = votes[uid] ?? [];
      return { uid, voted: uid in votes, targets, correct: targets.filter((t) => switchers.includes(t)).length };
    }),
  };
}

const HINTS = {
  profanity: "욕설로 읽힐 수 있는 표현이 있어요. 그 부분을 바꿔서 다시 보내 주세요.",
  personal_attack: "사람을 향한 공격으로 읽힐 수 있어요. 상대가 아니라 주장이나 이유에 대해 말해 보세요.",
  mockery: "다른 학생을 놀리거나 깎아내리는 표현으로 읽힐 수 있어요. 동의하지 않는 이유를 설명하는 문장으로 바꿔 보세요.",
};
const START = "(?<![가-힣ㄱ-ㅎA-Za-z])";
const SEP = "[\\d_*.\\-~!@#$%^&()+=]{0,2}";
const words = (...list: string[]) => list.map((w) => [...w].join(SEP)).join("|");
const RULES: [RegExp, keyof typeof HINTS][] = [
  [new RegExp(`ㅅㅂ|ㅆㅂ|ㅂㅅ|ㅄ|ㅈㄴ|ㅈㄹ|ㅅㄲ|좆|${START}(?:(?:${words("시발", "씨발", "씨팔", "시팔")})(?!점|역)|${words("병신", "개새끼", "새끼", "존나", "지랄", "느금", "니애미")})`), "profanity"],
  [new RegExp(`${START}(?:꺼져(?:라)?(?=\\s*[!~?.]*\\s*$|\\s*[!~])|닥쳐(?:라)?(?=[\\s!.~?]|$)|입\\s*닥|뒤져라|죽을래)`), "personal_attack"],
  [new RegExp(`${START}(?:너|니|넌|너는|니는|네가|니가|쟤|걔)(?=\\s|$).{0,12}?(?:바보|멍청|한심|무식|찐따|등신|머저리|쓰레기|돌대가리|노답|미친|또라이|수준\\s*낮)`), "personal_attack"],
  [new RegExp(`${START}(?:찐따|머저리|돌대가리|또라이|미친놈|등신)|ㅋㅋㅋ+\\s*(?:수준|어이없|한심)`), "mockery"],
];

/** Practice only: the clear-cut rules. The real game also asks the AI on the server. */
export function practiceCheck(text: string) {
  for (const [pattern, category] of RULES) {
    const match = text.match(pattern);
    if (match) return { hint: HINTS[category], excerpt: match[0].slice(0, 30) };
  }
  return null;
}
