import json
from functools import lru_cache
from pathlib import Path


TOPICS_PATH = Path(__file__).resolve().parents[1] / "content" / "topics"


def validate_topic(topic: dict) -> dict:
    required = {"topicId", "title", "background", "question", "tags", "isHypothetical", "status", "active", "version", "roles", "scenario", "questions", "sources", "sourceStatus"}
    if required - topic.keys():
        raise ValueError(f"Missing topic fields: {required - topic.keys()}")
    prefix = topic["topicId"]
    roles = topic["roles"]
    if not 4 <= len(roles) <= 6:
        raise ValueError(f"{prefix}: expected 4–6 roles")
    ids = []
    for role in roles:
        ids.append(role["id"])
        if not role["id"].startswith(prefix) or len(role["cards"]) != 3:
            raise ValueError(f"{prefix}: foreign role or missing cards")
        if not all(role.get(k) for k in ("name", "goal", "priority", "stance")):
            raise ValueError(f"{prefix}: incomplete role")
        for card in role["cards"]:
            ids.append(card["id"])
            if not card["id"].startswith(prefix) or not card.get("text"):
                raise ValueError(f"{prefix}: foreign/empty card")
            if card.get("type") == "evidence" and (not card.get("sources") or not card.get("limitations")):
                raise ValueError("Evidence requires a source and limitations")
    scenario = topic["scenario"]
    ids.append(scenario["id"])
    ids.extend(option["id"] for option in scenario["options"])
    if len(scenario["options"]) < 2 or not topic["questions"]:
        raise ValueError(f"{prefix}: incomplete scenario or questions")
    if len(ids) != len(set(ids)) or any(not x.startswith(prefix) for x in ids):
        raise ValueError(f"{prefix}: duplicate or foreign identifiers")
    return topic


@lru_cache(maxsize=1)
def load_topics() -> tuple[dict, ...]:
    topics = tuple(validate_topic(json.loads(path.read_text(encoding="utf-8-sig"))) for path in sorted(TOPICS_PATH.glob("*.json")))
    if len(topics) < 5:
        raise ValueError("At least five complete topic packs are required")
    if len({t["topicId"] for t in topics}) != len(topics):
        raise ValueError("Duplicate topic ids")
    return topics
