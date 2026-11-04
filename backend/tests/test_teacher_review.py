"""No external AI requests or real Firebase data. Reuse the existing review workflow."""
import os
from pathlib import Path
import subprocess
import sys
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services import ai, moderation
from app.services.moderation import Moderator
from conftest import TEACHER, started_room, to_phase


def never_call_ai(_):
    pytest.fail("Teacher review must never send content to external AI")


@pytest.mark.parametrize("text,status", [
    ("^^1 발", "flag"), ("^^l 발", "flag"), ("^^I 발", "flag"),
    ("LH @H 미", "flag"), ("너 진짜 멍청하다", "flag"),
    ("ㅅㅂ", "review"), ("운지", "review"),
    ("저는 그 의견에 반대합니다.", "review"),
    ("김대중", "review"), ("역사적 사건의 배경을 토론해요.", "review"),
])
def test_teacher_review_preserves_rules_without_ai(text, status):
    verdict = Moderator(mode="teacher_review", ai_call=never_call_ai).review(text)
    assert verdict.status == status
    assert verdict.source == "rules"
    # Even ordinary text is intentionally private until approved, not an outage or a BLOCK.
    if status == "review":
        assert verdict.decision == "REVIEW" and verdict.status != "unavailable"


def test_teacher_review_blocks_direct_ai_entrypoint_even_with_a_key(monkeypatch):
    monkeypatch.setattr(ai, "settings", SimpleNamespace(moderation_mode="teacher_review", gemini_api_key="test-marker"))
    monkeypatch.setattr(ai, "urlopen", lambda *a, **kw: pytest.fail("External request attempted"))
    with pytest.raises(ai.AIUnavailable, match="disabled"):
        ai.generate_json("Synthetic test text")


def test_filter_failure_still_fails_closed_without_ai(monkeypatch):
    def broken(_):
        raise RuntimeError("Synthetic failure")
    monkeypatch.setattr(moderation, "rule_check", broken)
    verdict = Moderator(mode="teacher_review", ai_call=never_call_ai).review("정상 문장")
    assert verdict.status == "unavailable" and verdict.decision == "REVIEW"


@pytest.mark.parametrize("decision", ["approve", "return"])
def test_normal_text_is_private_until_authorized_teacher_decides(game, decision):
    service, _ = game
    service.moderator = Moderator(mode="teacher_review", ai_call=never_call_ai)
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    original = "서로의  근거를 비교해요."
    result = service.post_text(rid, uids[0], "response", {"text": original, "requestId": "teacher-review-request-1"})
    assert result["moderation"]["status"] == "pending_review"
    assert service.repository.read(rid)["rounds"]["chat"] == []
    assert "host" not in service.read(rid, uids[1])
    entry = service.read(rid, TEACHER)["host"]["moderation"][-1]
    assert entry["text"] == original
    with pytest.raises(HTTPException) as unauthorized:
        service.action(rid, uids[1], "review", {"entryId": entry["id"], "decision": "approve"})
    assert unauthorized.value.status_code == 403
    service.action(rid, TEACHER, "review", {"entryId": entry["id"], "decision": decision})
    chat = service.repository.read(rid)["rounds"]["chat"]
    assert [row["text"] for row in chat] == ([original] if decision == "approve" else [])
    if chat:
        assert chat[0]["viaTeacher"] is True


def test_block_cannot_be_published_by_teacher(game):
    service, _ = game
    service.moderator = Moderator(mode="teacher_review", ai_call=never_call_ai)
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    service.post_text(rid, uids[0], "response", {"text": "^^1 발"})
    entry = service.read(rid, TEACHER)["host"]["moderation"][-1]
    with pytest.raises(HTTPException) as blocked:
        service.action(rid, TEACHER, "review", {"entryId": entry["id"], "decision": "approve"})
    assert blocked.value.status_code == 409
    assert service.repository.read(rid)["rounds"]["chat"] == []


def test_full_review_queue_rejects_new_text_until_teacher_decides(game, monkeypatch):
    from app.services import game as game_module
    monkeypatch.setattr(game_module, "MAX_LOG", 2)
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    service.moderator = Moderator(mode="teacher_review", ai_call=never_call_ai)
    for uid in uids[:2]:
        service.post_text(rid, uid, "response", {"text": "검토할 정상 발언"})
    before = service.read(rid, TEACHER)["host"]["moderation"]
    with pytest.raises(HTTPException) as full:
        service.post_text(rid, uids[2], "response", {"text": "세 번째 발언", "requestId": "queue-retry"})
    assert full.value.status_code == 429
    assert service.read(rid, TEACHER)["host"]["moderation"] == before
    assert service.repository.read(rid)["rounds"]["chat"] == []
    service.action(rid, TEACHER, "review", {"entryId": before[0]["id"], "decision": "return"})
    result = service.post_text(rid, uids[2], "response", {"text": "세 번째 발언", "requestId": "queue-retry"})
    assert result["moderation"]["status"] == "pending_review"
    entries = service.read(rid, TEACHER)["host"]["moderation"]
    assert {row["id"] for row in entries} == {before[1]["id"], result["moderation"]["messageId"]}


def test_blocked_messages_do_not_evict_pending_reviews(game, monkeypatch):
    from app.services import game as game_module
    monkeypatch.setattr(game_module, "MAX_LOG", 2)
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    service.moderator = Moderator(mode="teacher_review", ai_call=never_call_ai)
    for uid in uids[:2]:
        service.post_text(rid, uid, "response", {"text": "검토할 정상 발언"})
    before = service.read(rid, TEACHER)["host"]["moderation"]
    blocked = service.post_text(rid, uids[2], "response", {"text": "^^1 발"})
    assert blocked["moderation"]["status"] == "needs_edit"
    assert service.read(rid, TEACHER)["host"]["moderation"] == before
    assert service.repository.read(rid)["rounds"]["chat"] == []


@pytest.mark.parametrize("mode,accepted", [("teacher_review", True), ("ai", True), ("rules", False), ("invalid", False)])
def test_production_configuration_retains_guards(mode, accepted):
    env = {**os.environ, "ENVIRONMENT": "production", "MODERATION_MODE": mode, "GEMINI_API_KEY": ""}
    result = subprocess.run([sys.executable, "-c", "from app.core.config import settings; assert settings.environment == 'production'"],
                            cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True)
    assert (result.returncode == 0) == accepted


@pytest.mark.emulator
@pytest.mark.skipif(os.getenv("RUN_EMULATOR_TESTS") != "1", reason="Emulator opt-in")
def test_teacher_review_firestore_projections_and_reconnect():
    assert os.environ["FIREBASE_PROJECT_ID"] == "demo-yunan"
    assert os.environ["FIRESTORE_EMULATOR_HOST"] == "127.0.0.1:8080"
    assert os.environ["FIREBASE_AUTH_EMULATOR_HOST"] == "127.0.0.1:9099"
    from app.core.firebase import firestore_client
    from app.repositories.rooms import FirestoreRoomRepository
    from app.services.game import GameService
    db = firestore_client()
    moderator = Moderator(mode="teacher_review", ai_call=never_call_ai)
    service = GameService(FirestoreRoomRepository(db), moderator=moderator)
    suffix = uuid.uuid4().hex
    host = "review-host-" + suffix
    users = [f"review-student-{i}-{suffix}" for i in range(6)]
    created = service.create(host, {"topicId": "school_cctv"})
    rid, code = created["room"]["roomId"], created["room"]["code"]
    roles = created["room"]["topic"]["roles"]
    for i, uid in enumerate(users):
        service.join(uid, {"nickname": f"검토{i}", "code": code})
        service.action(rid, uid, "preferences", {"first": roles[0]["id"], "second": roles[1]["id"]})
    service.action(rid, host, "start", {})
    for uid in users:
        service.action(rid, uid, "confirm-role", {})
    for uid in users:
        result = service.post_text(rid, uid, "statement", {"text": "장단점을 비교하겠습니다."})
        assert result["moderation"]["status"] == "pending_review"
    assert service.repository.read(rid)["statements"] == {}
    pending = list(service.read(rid, host)["host"]["moderation"])
    for entry in pending:
        service.action(rid, host, "review", {"entryId": entry["id"], "decision": "approve"})
    assert service.read(rid, host)["room"]["phase"] == "event"
    public = db.document(f"rooms/{rid}/publicRounds/chat")
    text = "서로의  주장을 비교해요."
    result = service.post_text(rid, users[0], "response", {"text": text, "requestId": "review-once"})
    assert result["moderation"]["status"] == "pending_review"
    assert public.get().to_dict()["items"] == []
    retry = service.post_text(rid, users[0], "response", {"text": text, "requestId": "review-once"})
    assert retry["moderation"]["messageId"] == result["moderation"]["messageId"]
    entry = service.read(rid, host)["host"]["moderation"][-1]
    service.action(rid, host, "review", {"entryId": entry["id"], "decision": "approve"})
    reconnected = GameService(FirestoreRoomRepository(db), moderator=moderator)
    assert [m["text"] for m in reconnected.read(rid, users[1])["rounds"]["chat"]] == [text]
    assert len(public.get().to_dict()["items"]) == 1
