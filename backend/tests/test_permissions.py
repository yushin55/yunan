import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.topics import load_topics
from conftest import four_players, start_and_assign


def test_authentication_required():
    with TestClient(app) as client:
        assert client.post("/api/rooms", json={"nickname": "anonymous"}).status_code == 401


def test_nonmember_host_and_private_boundaries(game):
    service, clock = game
    rid = four_players(service)
    with pytest.raises(HTTPException) as error:
        service.read(rid, "outsider")
    assert error.value.status_code == 403
    with pytest.raises(HTTPException):
        service.action(rid, "u1", "start", {})
    start_and_assign(service, clock, rid)
    current = service.read(rid, "u0")
    assert "나만의 실제 의견 1" not in str(current)
    assert all("isSwitcher" not in p and "preferences" not in p for p in current["participants"])
    assert "reveal" not in current["rounds"]
    service.action(rid, "u0", "claim", {"text": "아직 공개하면 안 되는 주장"})
    assert "아직 공개하면 안 되는 주장" not in str(service.read(rid, "u1"))


def test_api_constraints_and_score_forgery(client):
    api, actor = client
    created = api.post("/api/rooms", json={"nickname": "친구"})
    assert created.status_code == 200
    rid = created.json()["room"]["roomId"]
    assert api.post(f"/api/rooms/{rid}/ready", json={"ready": True, "score": 100}).status_code == 422
    assert api.post(f"/api/rooms/{rid}/claim", json={"text": "a" * 101}).status_code == 422
    assert api.post(f"/api/rooms/{rid}/rating", json={"targetUid": "u1", "accuracy": 9, "respect": 5, "evidence": 5}).status_code == 422


def test_wrong_card_is_rejected_and_retries_idempotent(game):
    service, clock = game
    rid = four_players(service)
    current = start_and_assign(service, clock, rid)
    foreign = next(t for t in load_topics() if t["topicId"] != current["room"]["topicId"])
    with pytest.raises(HTTPException):
        service.action(rid, "u0", "claim", {"text": "주장", "cardId": foreign["roles"][0]["cards"][0]["id"], "cardConnection": "연결 설명"})
    data = {"text": "같은 내용 한 번만"}
    service.action(rid, "u0", "claim", data)
    service.action(rid, "u0", "claim", data)
    assert len(service.repository.read(rid)["submissions"]["claim"]) == 1
    with pytest.raises(HTTPException):
        service.action(rid, "u0", "claim", {"text": "다른 내용"})


def test_self_target_and_other_answer_rejected(game):
    service, clock = game
    rid = four_players(service)
    start_and_assign(service, clock, rid)
    from conftest import expire
    for _ in range(4):  # claim, its review, scenario, its review
        expire(service, clock, rid)
    assert service.read(rid, "u0")["room"]["phase"] == "question"
    with pytest.raises(HTTPException):
        service.action(rid, "u0", "question", {"targetUid": "u0", "text": "자문"})
    service.action(rid, "u0", "question", {"targetUid": "u1", "text": "어떤 기준인가요?"})
    with pytest.raises(HTTPException):
        service.action(rid, "u2", "answer", {"questionId": "q_u0", "text": "가로채기"})
