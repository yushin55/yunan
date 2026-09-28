import random


def assign_roles(topic: dict, players: dict, rng=None) -> dict:
    """Two players are guaranteed outside their two preferences; duplicates are allowed."""
    rng = rng or random.SystemRandom()
    uids = list(players)
    switchers = set(rng.sample(uids, 2))
    roles = topic["roles"]
    role_ids = {role["id"] for role in roles}
    assignments = {}
    for uid, player in players.items():
        initial = player["initialPosition"]
        preferences = initial["preferences"]
        if len(set(preferences)) != 2 or not set(preferences) <= role_ids:
            raise ValueError("Preferences must belong to the pinned topic")
        choices = [r for r in roles if (r["id"] not in preferences) == (uid in switchers)]
        if uid in switchers and initial["position"] != "neutral":
            opposite = "oppose" if "support" in initial["position"] else "support"
            choices = [r for r in choices if r["stance"] == opposite] or choices
        role = rng.choice(choices)
        assignments[uid] = {"roleId": role["id"], "isSwitcher": uid in switchers, "cards": role["cards"]}
    return assignments
