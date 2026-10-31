"""Reviewed topic data and the removal of the previous design's features."""
from app.main import app
from app.repositories.topics import load_game_config, load_topics, public_topic
from app.services.phase_engine import PHASES

EXPECTED_TITLES = [
    "수업 중 학생의 스마트폰 사용을 제한해야 할까?",
    "학교 과제에 생성형 AI 사용을 허용해야 할까?",
    "학교 내 CCTV 설치 범위를 확대해야 할까?",
    "교복 착용을 학생 자율에 맡겨야 할까?",
    "학교 급식의 잔반을 줄이기 위한 규칙을 도입해야 할까?",
    "청소년의 대중교통 요금을 더 지원해야 할까?",
]


def test_six_reviewed_topics_with_distinct_roles_events_and_questions():
    topics = load_topics()
    assert [t["title"] for t in topics] == EXPECTED_TITLES
    role_names, events, prompts = set(), set(), set()
    for topic in topics:
        assert topic["status"] == "editorial_reviewed" and topic["situation"]
        assert len(topic["roles"]) >= 4
        for role in topic["roles"]:
            assert role["intro"] and role["goal"] and role["concerns"]
            assert "stance" not in role  # Roles are stakeholders, not pro/con labels.
        assert topic["events"] and topic["questionPrompts"] and topic["teacherGuide"]["tips"]
        role_names.add(tuple(r["name"] for r in topic["roles"]))
        events.update(e["description"] for e in topic["events"])
        prompts.add(tuple(topic["questionPrompts"]))
    assert len(role_names) == len(events) == len(prompts) == 6


def test_every_topic_has_a_sourced_issue_briefing():
    for topic in load_topics():
        briefing = topic["briefing"]
        assert len(briefing["scenes"]) >= 3 and topic["title"] in briefing["scenes"][-1]["lines"]
        ids = {s["id"] for s in briefing["sources"]}
        assert all(s["url"].startswith("https://") for s in briefing["sources"])
        assert all(set(scene.get("sourceIds", [])) <= ids for scene in briefing["scenes"])
        assert any(scene.get("sourceIds") for scene in briefing["scenes"])


def test_public_topic_hides_event_cards_and_teacher_guide(client):
    api, _ = client
    body = api.get("/api/topics").json()
    assert len(body["topics"]) == 6
    assert body["config"]["minStudents"] == 6 and body["config"]["maxStudents"] == 8
    for topic in body["topics"]:
        assert "events" not in topic and "teacherGuide" not in topic
    assert public_topic(load_topics()[0])["roles"][0].keys() == {"id", "name", "intro", "goal", "concerns"}


def test_phases_end_at_reveal_without_real_opinion_steps():
    assert PHASES == ["lobby", "role", "statement", "event", "rebuttal", "vote", "reveal", "ended"]
    assert set(load_game_config()["phaseSeconds"]) == {"role", "statement", "event", "rebuttal", "vote"}


def test_removed_features_have_no_api():
    paths = " ".join(app.openapi()["paths"])
    for removed in ("initial-position", "reflection", "rating", "guess", "react", "review-done", "report", "assist", "coach", "tone", "hint", "score", "claim", "scenario"):
        assert removed not in paths, removed
