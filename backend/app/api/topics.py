from fastapi import APIRouter

from app.repositories.topics import load_game_config, load_topics, public_topic

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("")
def topics():
    """The six reviewed topics for the teacher's picker. Event cards and teacher guides stay out."""
    config = load_game_config()
    return {
        "topics": [public_topic(topic) for topic in load_topics()],
        "config": {k: config[k] for k in ("minStudents", "maxStudents", "switcherCounts", "defaultSwitcherCount", "phaseSeconds", "phaseSecondsRange", "textLimits")},
    }
