import random

import pytest

from app.repositories.topics import load_topics
from app.services.role_assignment import assign_roles


@pytest.mark.parametrize("count", [4, 5, 6])
def test_two_switchers_and_only_topic_roles(count):
    for topic in load_topics():
        prefs = [r["id"] for r in topic["roles"][:2]]
        players = {f"u{i}": {"initialPosition": {"preferences": prefs, "position": "neutral"}} for i in range(count)}
        assignments = assign_roles(topic, players, random.Random(2))
        assert sum(a["isSwitcher"] for a in assignments.values()) >= 2
        for assignment in assignments.values():
            assert (assignment["roleId"] not in prefs) == assignment["isSwitcher"]
            role = next(r for r in topic["roles"] if r["id"] == assignment["roleId"])
            assert assignment["cards"] == role["cards"]


def test_foreign_preferences_rejected():
    topic = load_topics()[0]
    players = {f"u{i}": {"initialPosition": {"preferences": ["foreign", "foreign2"], "position": "support"}} for i in range(4)}
    with pytest.raises(ValueError):
        assign_roles(topic, players)
