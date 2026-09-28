import copy
import random


def pick_topic(topics: list | tuple, previous_id: str | None = None, forced_id: str | None = None, rng=None) -> dict:
    rng = rng or random.SystemRandom()
    active = [t for t in topics if t["active"]]
    if forced_id:
        active = [t for t in active if t["topicId"] == forced_id]
    elif len(active) > 1:
        active = [t for t in active if t["topicId"] != previous_id]
    if not active:
        raise ValueError("No active topic packs")
    return copy.deepcopy(rng.choice(active))
