from fastapi import HTTPException
import pytest

from conftest import expire, four_players, start_and_assign


def claimed(service, clock):
    rid = four_players(service)
    start_and_assign(service, clock, rid)
    for i in range(4):
        service.action(rid, f"u{i}", "claim", {"text": f"참가자 {i}의 입장"})
    return rid


def test_review_follows_each_public_round_and_shows_every_turn(game):
    service, clock = game
    rid = claimed(service, clock)
    seen = service.read(rid, "u2")
    assert seen["room"]["phase"] == "claim_review"
    assert {row["uid"] for row in seen["rounds"]["claim"]} == {"u0", "u1", "u2", "u3"}
    assert seen["room"]["phaseEndsAt"] is not None


def test_reactions_are_public_replaceable_and_withdrawable(game):
    service, clock = game
    rid = claimed(service, clock)
    service.action(rid, "u1", "react", {"targetUid": "u0", "kind": "agree"})
    service.action(rid, "u1", "react", {"targetUid": "u0", "kind": "rebut"})
    service.action(rid, "u2", "react", {"targetUid": "u0", "kind": "curious"})
    reactions = service.read(rid, "u3")["rounds"]["reactions"]
    assert sorted((r["uid"], r["kind"], r["round"]) for r in reactions) == [("u1", "rebut", "claim"), ("u2", "curious", "claim")]
    service.action(rid, "u2", "react", {"targetUid": "u0", "kind": None})
    assert [r["uid"] for r in service.read(rid, "u0")["rounds"]["reactions"]] == ["u1"]


def test_reactions_only_during_review_and_never_to_self(game):
    service, clock = game
    rid = claimed(service, clock)
    with pytest.raises(HTTPException) as error:
        service.action(rid, "u1", "react", {"targetUid": "u1", "kind": "agree"})
    assert error.value.status_code == 422
    for i in range(4):
        service.action(rid, f"u{i}", "review-done", {})
    assert service.read(rid, "u0")["room"]["phase"] == "scenario"
    with pytest.raises(HTTPException) as error:
        service.action(rid, "u1", "react", {"targetUid": "u0", "kind": "agree"})
    assert error.value.status_code == 409


def test_review_waits_for_everyone_or_the_deadline(game):
    service, clock = game
    rid = claimed(service, clock)
    for i in range(3):
        service.action(rid, f"u{i}", "review-done", {})
        service.action(rid, f"u{i}", "review-done", {})  # Retries are harmless.
    assert service.read(rid, "u0")["room"]["phase"] == "claim_review"
    expire(service, clock, rid)
    assert service.read(rid, "u0")["room"]["phase"] == "scenario"


def test_react_api_validates_kind(client, game):
    api, actor = client
    service, clock = game
    rid = claimed(service, clock)
    actor[0] = "u1"
    assert api.post(f"/api/rooms/{rid}/react", json={"targetUid": "u0", "kind": "boo"}).status_code == 422
    assert api.post(f"/api/rooms/{rid}/react", json={"targetUid": "u0", "kind": "agree"}).status_code == 200
    assert api.post(f"/api/rooms/{rid}/review-done", json={}).status_code == 200
