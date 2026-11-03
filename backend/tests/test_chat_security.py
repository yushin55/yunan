from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException

from app.services.moderation import Moderator
from conftest import TEACHER, started_room, to_phase


def event(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    return service, rid, uids


def test_concurrent_retries_publish_once(game):
    service, rid, users = event(game)
    data = {"text": "같은 요청은 한 번만 공개합니다.", "requestId": "same-request"}
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: service.post_text(rid, users[0], "response", data), range(8)))
    assert len({r["moderation"]["messageId"] for r in results}) == 1
    assert len(service.repository.read(rid)["rounds"]["chat"]) == 1
    with pytest.raises(HTTPException) as error:
        service.post_text(rid, users[0], "response", {**data, "text": "다른 내용"})
    assert error.value.status_code == 409


def test_retry_of_block_or_review_does_not_duplicate_private_entries(game):
    service, rid, users = event(game)
    for i, text in enumerate(["^^1 발", "ㅅㅂ"]):
        for _ in range(3):
            service.post_text(rid, users[0], "response", {"text": text, "requestId": f"private-{i}"})
    state = service.repository.read(rid)
    assert len(state["host"]["moderation"]) == 2 and not state["rounds"]["chat"]


@pytest.mark.parametrize("approval_first", [True, False])
def test_review_revision_and_approval_serialize(game, approval_first):
    service, rid, users = event(game)
    result = service.post_text(rid, users[0], "response", {"text": "ㅅㅂ", "requestId": "initial"})
    entry = result["moderation"]["messageId"]
    approve = lambda: service.action(rid, TEACHER, "review", {"entryId": entry, "decision": "approve"})
    revise = lambda: service.post_text(rid, users[0], "response", {"text": "수정한 정상 의견입니다.", "requestId": "revision", "replacesId": entry})
    first, second = (approve, revise) if approval_first else (revise, approve)
    first()
    with pytest.raises(HTTPException) as error:
        second()
    assert error.value.status_code == 409
    assert len(service.repository.read(rid)["rounds"]["chat"]) == 1


def test_other_teacher_cannot_review_and_closed_room_cannot_publish(game):
    service, rid, users = event(game)
    other = service.create("other-teacher", {"topicId": "school_cctv"})
    entry = service.post_text(rid, users[0], "response", {"text": "ㅅㅂ"})["moderation"]["messageId"]
    with pytest.raises(HTTPException) as error:
        service.action(rid, other["host"]["uid"], "review", {"entryId": entry, "decision": "approve"})
    assert error.value.status_code == 403
    to_phase(service, rid, "reveal")
    service.action(rid, TEACHER, "end", {})
    for operation in [lambda: service.action(rid, TEACHER, "review", {"entryId": entry, "decision": "approve"}),
                      lambda: service.post_text(rid, users[0], "response", {"text": "종료 후 발언"})]:
        with pytest.raises(HTTPException) as error:
            operation()
        assert error.value.status_code == 409
    assert not service.repository.read(rid)["rounds"]["chat"]


def test_filter_timeout_is_private(game):
    service, rid, users = event(game)
    def timeout(_):
        raise TimeoutError("simulated")
    service.moderator = Moderator(mode="ai", ai_call=timeout)
    result = service.post_text(rid, users[0], "response", {"text": "타임아웃 검사"})
    assert result["moderation"]["status"] == "pending_review"
    assert not service.repository.read(rid)["rounds"]["chat"]


def test_receipts_are_server_only_and_bounded(game):
    service, rid, users = event(game)
    # Three phase windows allow more than 64 private receipts without changing game quotas.
    for i in range(66):
        game[1][0] += 61000
        # Keep the test timer stationary; only the persisted rate window changes.
        service.repository.states[rid]["room"]["phaseEndsAt"] = game[1][0] + 300000
        service.post_text(rid, users[0], "response", {"text": "^^1 발", "requestId": f"receipt-{i}"})
    state = service.repository.read(rid)
    assert len(state["requestReceipts"][users[0]]) == 64
    assert "receipt-65" in state["requestReceipts"][users[0]]
    assert "requestReceipts" not in service.read(rid, users[0])
