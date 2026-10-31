"""Reviewed topic packs and game settings. The game never generates topics at runtime."""
import json
from functools import lru_cache
from pathlib import Path

CONTENT_PATH = Path(__file__).resolve().parents[1] / "content"
TOPICS_PATH = CONTENT_PATH / "topics"
TOPIC_COUNT = 6
PUBLIC_ROLE_FIELDS = ("id", "name", "intro", "goal", "concerns")


def validate_topic(topic: dict) -> dict:
    required = {"topicId", "title", "shortTitle", "situation", "isHypothetical", "status", "version", "roles", "events", "questionPrompts", "teacherGuide", "briefing"}
    missing = required - topic.keys()
    if missing:
        raise ValueError(f"Missing topic fields: {missing}")
    prefix = topic["topicId"]
    if topic["status"] != "editorial_reviewed":
        raise ValueError(f"{prefix}: only reviewed topics can be loaded")
    roles = topic["roles"]
    if len(roles) < 4:
        raise ValueError(f"{prefix}: at least four roles are required")
    for role in roles:
        if not all(role.get(k) for k in PUBLIC_ROLE_FIELDS) or len(role["concerns"]) < 1:
            raise ValueError(f"{prefix}: incomplete role {role.get('id')}")
    events = topic["events"]
    if not events or not all(e.get("id") and e.get("title") and e.get("description") for e in events):
        raise ValueError(f"{prefix}: at least one complete event card is required")
    if len(topic["questionPrompts"]) < 3:
        raise ValueError(f"{prefix}: question prompts are required")
    guide = topic["teacherGuide"]
    if not guide.get("summary") or not guide.get("tips"):
        raise ValueError(f"{prefix}: teacher guide is required")
    validate_briefing(prefix, topic["briefing"])
    ids = [r["id"] for r in roles] + [e["id"] for e in events]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{prefix}: duplicate identifiers")
    return topic


def validate_briefing(prefix: str, briefing: dict) -> None:
    """The pre-game issue briefing summarises real reporting, so every claim scene cites a source."""
    scenes, sources = briefing.get("scenes") or [], briefing.get("sources") or []
    if len(scenes) < 3 or not all(s.get("title") and s.get("lines") for s in scenes):
        raise ValueError(f"{prefix}: briefing needs at least three complete scenes")
    source_ids = set()
    for source in sources:
        if not all(source.get(k) for k in ("id", "publisher", "title", "date", "url")) or not source["url"].startswith("https://"):
            raise ValueError(f"{prefix}: incomplete briefing source")
        source_ids.add(source["id"])
    cited = [i for s in scenes for i in s.get("sourceIds", [])]
    if not cited or not set(cited) <= source_ids:
        raise ValueError(f"{prefix}: briefing scenes must cite listed sources")


@lru_cache(maxsize=1)
def load_topics() -> tuple[dict, ...]:
    topics = tuple(validate_topic(json.loads(path.read_text(encoding="utf-8-sig"))) for path in sorted(TOPICS_PATH.glob("*.json")))
    if len(topics) != TOPIC_COUNT:
        raise ValueError(f"Exactly {TOPIC_COUNT} reviewed topics are expected, found {len(topics)}")
    if len({t["topicId"] for t in topics}) != len(topics):
        raise ValueError("Duplicate topic ids")
    role_ids = [r["id"] for t in topics for r in t["roles"]]
    event_ids = [e["id"] for t in topics for e in t["events"]]
    if len(role_ids) != len(set(role_ids)) or len(event_ids) != len(set(event_ids)):
        raise ValueError("Roles and event cards must differ between topics")
    return topics


def find_topic(topic_id: str) -> dict | None:
    return next((t for t in load_topics() if t["topicId"] == topic_id), None)


def public_topic(topic: dict) -> dict:
    """What every student may see once the teacher picks the topic: no event card, no teacher guide."""
    return {
        "topicId": topic["topicId"], "title": topic["title"], "shortTitle": topic["shortTitle"],
        "situation": topic["situation"], "version": topic["version"], "isHypothetical": topic["isHypothetical"],
        "roles": [{k: role[k] for k in PUBLIC_ROLE_FIELDS} for role in topic["roles"]],
        "questionPrompts": list(topic["questionPrompts"]),
        "briefing": topic["briefing"],
    }


@lru_cache(maxsize=1)
def load_game_config() -> dict:
    config = json.loads((CONTENT_PATH / "game_config.json").read_text(encoding="utf-8-sig"))
    if not 1 <= config["minStudents"] <= config["maxStudents"]:
        raise ValueError("Invalid student limits")
    if config["defaultSwitcherCount"] not in config["switcherCounts"]:
        raise ValueError("Invalid default switcher count")
    return config
