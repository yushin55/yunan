import copy
import random

import pytest

from app.repositories.topics import load_topics, validate_topic
from app.services.topic_picker import pick_topic


def test_five_complete_topic_packs():
    topics = load_topics()
    assert len(topics) >= 5
    for topic in topics:
        assert len(topic["roles"]) == 6
        assert all(len(r["cards"]) == 3 for r in topic["roles"])
        assert len(topic["scenario"]["options"]) >= 2
        assert topic["sourceStatus"] == "discussion_only"


def test_random_picker_reaches_every_pack_and_avoids_previous():
    topics = load_topics()
    chosen = {pick_topic(topics, rng=random.Random(seed))["topicId"] for seed in range(100)}
    assert chosen == {t["topicId"] for t in topics}
    for topic in topics:
        assert pick_topic(topics, topic["topicId"])["topicId"] != topic["topicId"]


def test_cross_topic_content_rejected():
    topic = copy.deepcopy(load_topics()[0])
    topic["roles"][0]["cards"][0]["id"] = load_topics()[1]["roles"][0]["cards"][0]["id"]
    with pytest.raises(ValueError):
        validate_topic(topic)
