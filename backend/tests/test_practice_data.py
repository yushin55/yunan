"""The offline practice mode uses a copy of the reviewed topics; it must not drift."""
import json
from pathlib import Path

from app.repositories.topics import load_topics

COPY = Path(__file__).resolve().parents[2] / "frontend" / "src" / "data" / "practiceTopics.json"


def test_practice_topics_match_the_reviewed_source():
    assert json.loads(COPY.read_text(encoding="utf-8")) == list(load_topics()), "Run `npm run content:sync` after editing topics."
