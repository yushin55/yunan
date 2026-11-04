"""Real Firestore transactions; no cloud project or AI service calls."""
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException

from app.core.firebase import firestore_client
from app.repositories.rooms import FirestoreRoomRepository
from app.services.game import GameService
from app.services.moderation import Moderator

pytestmark = [pytest.mark.emulator, pytest.mark.skipif(os.getenv("RUN_EMULATOR_TESTS") != "1", reason="Emulator opt-in")]


@pytest.fixture
def event():
    assert os.environ["FIRESTORE_EMULATOR_HOST"] == "127.0.0.1:8080"
    assert os.environ["FIREBASE_AUTH_EMULATOR_HOST"] == "127.0.0.1:9099"
    db = firestore_client()
    service = GameService(FirestoreRoomRepository(db), moderator=Moderator(mode="rules"))
    suffix = uuid.uuid4().hex
    host = f"host-{suffix}"
    created = service.create(host, {"topicId": "school_cctv"})
    rid, code = created["room"]["roomId"], created["room"]["code"]
    users = [f"student-{i}-{suffix}" for i in range(6)]
    roles = created["room"]["topic"]["roles"]
    for i, uid in enumerate(users):
        service.join(uid, {"nickname": f"경합{i}", "code": code})
        service.action(rid, uid, "preferences", {"first": roles[0]["id"], "second": roles[1]["id"]})
    service.action(rid, host, "start", {})
    for uid in users:
        service.action(rid, uid, "confirm-role", {})
    for uid in users:
        service.post_text(rid, uid, "statement", {"text": "정상적인 토론 의견입니다."})
    assert service.read(rid, host)["room"]["phase"] == "event"
    return service, db, rid, host, users


def race(operations):
    barrier = threading.Barrier(len(operations))
    def execute(operation):
        barrier.wait(timeout=10)
        try:
            value = operation()
            return 200, value
        except HTTPException as error:
            return error.status_code, None
    with ThreadPoolExecutor(max_workers=len(operations)) as pool:
        return list(pool.map(execute, operations))


def test_eight_simultaneous_duplicate_sends_commit_once(event):
    service, db, rid, _, users = event
    send = lambda: service.post_text(rid, users[0], "response", {"text": "원문을 한 번만 공개", "requestId": "one-request"})
    results = race([send] * 8)
    assert all(status == 200 for status, _ in results)
    assert len({r["moderation"]["messageId"] for _, r in results}) == 1
    assert len(db.document(f"rooms/{rid}/publicRounds/chat").get().to_dict()["items"]) == 1
    assert len(service.repository.read(rid)["requestReceipts"][users[0]]) == 1


@pytest.mark.parametrize("iteration", range(3))
def test_approval_vs_student_revision_has_one_winner(event, iteration):
    service, db, rid, host, users = event
    entry = service.post_text(rid, users[0], "response", {"text": "ㅅㅂ", "requestId": "first"})["moderation"]["messageId"]
    results = race([
        lambda: service.action(rid, host, "review", {"entryId": entry, "decision": "approve"}),
        lambda: service.post_text(rid, users[0], "response", {"text": "수정된 정상 의견", "requestId": f"revision-{iteration}", "replacesId": entry}),
    ])
    assert sorted(status for status, _ in results) == [200, 409]
    items = db.document(f"rooms/{rid}/publicRounds/chat").get().to_dict()["items"]
    assert len(items) == 1 and items[0]["text"] in ("ㅅㅂ", "수정된 정상 의견")


def test_two_simultaneous_approvals_publish_once(event):
    service, db, rid, host, users = event
    entry = service.post_text(rid, users[0], "response", {"text": "운지"})["moderation"]["messageId"]
    approve = lambda: service.action(rid, host, "review", {"entryId": entry, "decision": "approve"})
    assert sorted(status for status, _ in race([approve, approve])) == [200, 409]
    assert len(db.document(f"rooms/{rid}/publicRounds/chat").get().to_dict()["items"]) == 1


def test_timeout_review_remains_private_in_firestore(event):
    service, db, rid, _, users = event
    def timeout(_):
        raise TimeoutError("simulated")
    service.moderator = Moderator(mode="ai", ai_call=timeout)
    result = service.post_text(rid, users[0], "response", {"text": "검사 타임아웃"})
    assert result["moderation"]["status"] == "pending_review"
    assert db.document(f"rooms/{rid}/publicRounds/chat").get().to_dict()["items"] == []
    private = db.document(f"rooms/{rid}/privatePlayers/{users[0]}").get().to_dict()
    assert private["notices"][-1]["status"] == "pending_review"


def test_closed_room_and_long_input_cannot_publish(event):
    service, db, rid, host, users = event
    with pytest.raises(HTTPException) as error:
        service.post_text(rid, users[0], "response", {"text": "가" * 201})
    assert error.value.status_code == 422
    entry = service.post_text(rid, users[0], "response", {"text": "ㅅㅂ"})["moderation"]["messageId"]
    while service.read(rid, host)["room"]["phase"] != "reveal":
        service.action(rid, host, "next", {})
    service.action(rid, host, "end", {})
    for operation in [lambda: service.post_text(rid, users[0], "response", {"text": "종료 후 새 발언", "requestId": "after-end"}),
                      lambda: service.action(rid, host, "review", {"entryId": entry, "decision": "approve"})]:
        with pytest.raises(HTTPException) as error:
            operation()
        assert error.value.status_code == 409
    assert db.document(f"rooms/{rid}/publicRounds/chat").get().to_dict()["items"] == []
