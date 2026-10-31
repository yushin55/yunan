import pytest
from fastapi import HTTPException

from app.services.ai import AIUnavailable
from app.services.moderation import Moderator, rule_check
from conftest import TEACHER, started_room, to_phase

FLAGGED = ["너 진짜 멍청하다", "시1발 뭐래", "ㅅㅂ 그게 말이 돼?", "닥쳐", "그냥 꺼져!", "니 말은 수준 낮아", "병*신 같은 소리", "ㅋㅋㅋ 수준 봐"]
ALLOWED = [
    "저는 그 의견에 반대합니다. 근거가 약하다고 생각해요.",
    "음식을 꼭꼭 씹어 먹으면 잔반이 줄어요.",
    "폰이 꺼져서 연락이 안 된 적이 있어요.",
    "사물함을 뒤져서 찾았다는 건 사생활 침해예요.",
    "학생 의견이 규칙의 시발점이 되어야 해요.",
    "자료 보존 나중에 해도 되나요?",
    "너무 엄격한 규칙이라고 생각해요.",
    "진짜 그렇게 생각하세요? 저는 납득이 안 돼요.",
    "그 주장은 틀렸다고 봐요. 비용을 고려하지 않았어요.",
]


@pytest.mark.parametrize("text", FLAGGED)
def test_rules_catch_clear_profanity_and_attacks(text):
    verdict = rule_check(text)
    assert verdict and verdict.status == "flag" and verdict.hint
    assert verdict.excerpt and verdict.excerpt in text


@pytest.mark.parametrize("text", ALLOWED)
def test_rules_allow_disagreement_and_ordinary_words(text):
    assert rule_check(text) is None


def test_ai_flag_quotes_only_the_students_own_words():
    moderator = Moderator(mode="ai", ai_call=lambda prompt: {"verdict": "flag", "category": "mockery", "excerpt": "다른 문장"})
    verdict = moderator.review("그 정도도 모르다니 웃기네요")
    assert verdict.status == "flag" and verdict.excerpt is None and verdict.hint
    moderator = Moderator(mode="ai", ai_call=lambda prompt: {"verdict": "ok"})
    assert moderator.review("저는 반대합니다").status == "ok"


def test_ai_failure_retries_then_falls_back_to_teacher_review():
    calls = []

    def broken(prompt):
        calls.append(prompt)
        raise AIUnavailable("down")

    verdict = Moderator(mode="ai", ai_call=broken).review("평범한 질문이에요")
    assert verdict.status == "unavailable" and len(calls) == 2
    # Clear-cut cases never depend on the AI being up.
    assert Moderator(mode="ai", ai_call=broken).review("닥쳐").status == "flag"


def in_event(service):
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    return rid, uids


def test_flagged_message_is_returned_to_author_only_and_never_published(game):
    service, _ = game
    rid, uids = in_event(service)
    result = service.post_text(rid, uids[0], "question", {"kind": "question", "text": "너 진짜 멍청하다", "targetUid": uids[1]})
    assert result["moderation"]["status"] == "needs_edit" and result["moderation"]["hint"]
    state = service.repository.read(rid)
    assert state["rounds"]["chat"] == []
    assert state["privatePlayers"][uids[0]]["notices"][-1]["status"] == "needs_edit"
    assert all(not p["notices"] for uid, p in state["privatePlayers"].items() if uid != uids[0])
    assert state["host"]["moderation"][-1]["status"] == "flagged"
    assert uids[0] in state["participants"]  # Nobody is removed automatically.
    fixed = service.post_text(rid, uids[0], "question", {"kind": "question", "text": "왜 그렇게 생각했는지 궁금해요.", "targetUid": uids[1]})
    assert fixed["moderation"]["status"] == "published"
    assert service.repository.read(rid)["rounds"]["chat"][-1]["text"] == "왜 그렇게 생각했는지 궁금해요."


def test_ai_outage_waits_for_the_teacher(game):
    service, _ = game
    service.moderator = Moderator(mode="ai", ai_call=lambda prompt: (_ for _ in ()).throw(AIUnavailable("down")))
    rid, uids = in_event(service)
    result = service.post_text(rid, uids[0], "response", {"kind": "response", "text": "선생님 확인이 필요한 메시지"})
    assert result["moderation"]["status"] == "pending_review"
    assert service.repository.read(rid)["rounds"]["chat"] == []
    second = service.post_text(rid, uids[1], "response", {"kind": "response", "text": "돌려받을 메시지"})
    entries = service.read(rid, TEACHER)["host"]["moderation"]
    first_id, second_id = entries[0]["id"], entries[1]["id"]
    service.action(rid, TEACHER, "review", {"entryId": first_id, "decision": "approve"})
    service.action(rid, TEACHER, "review", {"entryId": second_id, "decision": "return"})
    state = service.repository.read(rid)
    assert [m["text"] for m in state["rounds"]["chat"]] == ["선생님 확인이 필요한 메시지"]
    assert state["rounds"]["chat"][0]["viaTeacher"] is True
    assert state["privatePlayers"][uids[1]]["notices"][-1]["status"] == "returned"
    assert second["moderation"]["status"] == "pending_review"
    with pytest.raises(HTTPException):
        service.action(rid, TEACHER, "review", {"entryId": first_id, "decision": "approve"})


def test_statement_pending_review_can_be_approved_after_the_round(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "statement")
    service.moderator = Moderator(mode="ai", ai_call=lambda prompt: (_ for _ in ()).throw(AIUnavailable("down")))
    service.post_text(rid, uids[0], "statement", {"text": "검토가 필요한 입장 발표"})
    service.action(rid, TEACHER, "next", {})
    entry = service.read(rid, TEACHER)["host"]["moderation"][0]
    service.action(rid, TEACHER, "review", {"entryId": entry["id"], "decision": "approve"})
    row = service.repository.read(rid)["rounds"]["statements"][0]
    assert row["text"] == "검토가 필요한 입장 발표" and row["late"] is True
