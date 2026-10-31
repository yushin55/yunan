"""Server-side role switcher selection. Only these rules and a server RNG decide; never AI.

1. Count every student's first preference per role.
2. The role with the most first preferences is the "most chosen role" (ties: random among tied).
3. Switchers are drawn at random from students whose first preference is that role.
4. A switcher receives a random role outside both of their own preferences.
5. Everyone else receives their first or second preference. To keep the table from
   piling onto one role, each takes whichever of the two currently has fewer holders
   (first preference on equal counts), processed in random order.
"""
import random
from collections import Counter


class AssignmentError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def assign_roles(role_ids: list[str], preferences: dict[str, tuple[str, str]], switcher_count: int, rng=None) -> dict:
    rng = rng or random.SystemRandom()
    if len(role_ids) < 4:
        raise AssignmentError("too_few_roles", "주제의 역할이 4개보다 적어 게임을 시작할 수 없어요.")
    if not preferences:
        raise AssignmentError("no_players", "역할을 고른 학생이 없어요.")
    for uid, (first, second) in preferences.items():
        if first == second or first not in role_ids or second not in role_ids:
            raise AssignmentError("invalid_preferences", "모든 학생이 이 주제의 서로 다른 역할 두 개를 골라야 해요.")

    counts = Counter(first for first, _ in preferences.values())
    most = max(counts.values())
    tied = sorted(role for role, count in counts.items() if count == most)
    top_role = rng.choice(tied)
    candidates = sorted(uid for uid, (first, _) in preferences.items() if first == top_role)
    if len(candidates) < switcher_count:
        raise AssignmentError(
            "not_enough_candidates",
            f"가장 많이 선택된 1순위 역할을 고른 학생이 {switcher_count}명보다 적어서 역할 전환자를 {switcher_count}명 뽑을 수 없어요. 역할 전환자 수를 1명으로 바꿔 주세요.",
        )
    switchers = rng.sample(candidates, switcher_count)

    assignments = {}
    for uid in switchers:
        options = [role for role in role_ids if role not in preferences[uid]]
        if not options:
            raise AssignmentError("no_unpreferred_role", "역할 전환자에게 줄 수 있는, 본인이 고르지 않은 역할이 없어요. 주제의 역할 구성을 확인해 주세요.")
        assignments[uid] = {"roleId": rng.choice(options), "isSwitcher": True, "preferenceRank": None}

    load = Counter(a["roleId"] for a in assignments.values())
    others = [uid for uid in sorted(preferences) if uid not in assignments]
    rng.shuffle(others)
    for uid in others:
        first, second = preferences[uid]
        role, rank = (first, 1) if load[first] <= load[second] else (second, 2)
        load[role] += 1
        assignments[uid] = {"roleId": role, "isSwitcher": False, "preferenceRank": rank}
    return {"assignments": assignments, "topRoleId": top_role, "tiedRoleIds": tied}
