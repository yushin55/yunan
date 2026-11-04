"""Project-authored regression corpus, not a representative language benchmark."""
import pytest
from fastapi import HTTPException
from app.services import moderation
from app.services.moderation import Moderator
from conftest import TEACHER, started_room, to_phase

BLOCK = [
    "^^1 발", "^^l 발", "^^I 발", "LH @H 미", "시1발", "씨!발", "시 발",
    "시시시발", "ㅅㅣㅂㅏㄹ", "씨발", "tlqkf", "Tlqkf", "qudtls",
    "씨\u200b발", "니 애 미", "느그애비", "너 진짜 멍청하다", "너희 집단은 쓰레기야",
    "너 운지해라", "죽여버린다", "닥쳐", "병*신", "ㅅㅂ 그게 말이 돼?",
    "너 씨발이라고 하면 학술적 설명이 되냐", "ㅋㅋㅋ 수준 봐", "정말씨발", "너는병신",
    "오늘은존나좋다", "너 운 지 해 라", "씨abc발",
]
ALLOW = [
    "박정희", "김대중", "노무현", "문재인", "윤석열", "이재명", "대통령 정책에 강하게 반대합니다.",
    "보수와 진보의 역사적 차이를 토론합니다.", "일베라는 커뮤니티의 역사에 대해 토론합니다.",
    "음식을 꼭꼭 씹어 먹어요.", "휴대폰이 꺼져서 연락을 못 했어요.", "사물함을 뒤져서 찾았어요.",
    "이것은 변화의 시발점입니다.", "열차 시발역을 확인해요.", "자료 보존 나중에 해도 돼요?",
    "고양이 새끼를 돌봐요.", "새끼 강아지가 귀여워요.", "피아노 운지법을 배웁니다.",
    "기타 운지 연습을 했어요.", "홍어 요리를 먹었어요.", "이 정책은 틀렸어요. 근거가 부족합니다.",
    "그라믄 안 된다 아이가.", "맞나? 와 그라노?", "Hello class", "a" * 200,
    "니엄마가 데리러 오신대", "홍어는 음식입니다.",
]
REVIEW = ["ㅅㅂ", "ㅆㅂ", "ㅂㅅ", "ㅈㄹ", "운지", "운 지", "홍어", "틀딱", "급식충",
          "'씨발'이라는 표현의 뜻을 설명합니다.", "병신이라는 단어의 의미는 무엇인가요?",
          "'정신병자'라는 욕설의 의미를 설명합니다.", "니엄마", "ㅋ" * 4097]


@pytest.mark.parametrize("expected,text", [("BLOCK", t) for t in BLOCK] + [("ALLOW", t) for t in ALLOW] + [("REVIEW", t) for t in REVIEW])
def test_policy_corpus(expected, text):
    assert Moderator(mode="rules").review(text).decision == expected


def test_review_is_not_ai_unavailability_and_never_calls_ai():
    def forbidden(_):
        raise AssertionError("Must not call external AI")
    result = Moderator(mode="ai", ai_call=forbidden).review("ㅅㅂ")
    assert result.status == "review" and result.source == "rules"


@pytest.mark.parametrize("mode", ["ai", "rules"])
def test_filter_exception_never_allows(mode, monkeypatch):
    def broken(_):
        raise RuntimeError("test")
    monkeypatch.setattr(moderation, "rule_check", broken)
    verdict = Moderator(mode=mode).review("평범한 문장")
    assert verdict.status == "unavailable" and verdict.decision == "REVIEW"


@pytest.mark.parametrize("payload", [None, [], {"verdict": "unexpected"}])
def test_bad_ai_payload_never_allows(payload):
    assert Moderator(mode="ai", ai_call=lambda _: payload).review("정상 의견").status == "unavailable"


def test_review_is_private_until_teacher_approval_and_original_is_preserved(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    raw = "ㅅㅂ"
    response = service.post_text(rid, uids[0], "response", {"text": raw})
    assert response["moderation"]["status"] == "pending_review"
    state = service.repository.read(rid)
    assert state["rounds"]["chat"] == []
    entry = state["host"]["moderation"][-1]
    assert entry["text"] == raw and entry["source"] == "rules"
    assert not service.read(rid, uids[1]).get("host")
    service.action(rid, TEACHER, "review", {"entryId": entry["id"], "decision": "approve"})
    assert service.repository.read(rid)["rounds"]["chat"][-1]["text"] == raw


def test_allowed_original_not_normalized(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    raw = "정책에  반대합니다!"
    service.post_text(rid, uids[0], "response", {"text": raw})
    assert service.repository.read(rid)["rounds"]["chat"][-1]["text"] == raw


def test_block_cannot_be_manually_published(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    service.post_text(rid, uids[0], "response", {"text": "^^1 발"})
    entry = service.repository.read(rid)["host"]["moderation"][-1]
    with pytest.raises(HTTPException) as error:
        service.action(rid, TEACHER, "review", {"entryId": entry["id"], "decision": "approve"})
    assert error.value.status_code == 409
    assert not service.repository.read(rid)["rounds"]["chat"]


def test_filter_error_uses_private_review_storage(game, monkeypatch):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    def broken(_):
        raise RuntimeError("test")
    monkeypatch.setattr(moderation, "rule_check", broken)
    result = service.post_text(rid, uids[0], "response", {"text": "아직 검사되지 않은 문장"})
    assert result["moderation"]["status"] == "pending_review"
    assert not service.repository.read(rid)["rounds"]["chat"]


def test_http_rejects_overlong_chat_before_publication(client, game):
    service, _ = game
    api, actor = client
    rid, uids = started_room(service)
    to_phase(service, rid, "event")
    actor[0] = uids[0]
    result = api.post(f"/api/rooms/{rid}/messages", json={"kind": "response", "text": "가" * 201})
    assert result.status_code == 422
    assert not service.repository.read(rid)["rounds"]["chat"]
