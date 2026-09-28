from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException
import pytest

from conftest import expire, four_players, start_and_assign


def test_topic_is_hidden_then_pinned_and_retry_safe(game):
    service, clock = game
    rid = four_players(service)
    assert "topic" not in service.read(rid, "u0")["room"]
    first = service.action(rid, "u0", "start", {})
    assert first["room"]["topicVersion"] == first["room"]["topic"]["version"]
    assert service.action(rid, "u0", "start", {})["room"]["topic"] == first["room"]["topic"]
    assert service.read(rid, "u1")["room"]["topic"] == first["room"]["topic"]


def test_deadline_server_checked_and_concurrent_sync_exactly_once(game):
    service, clock = game
    rid = four_players(service)
    first = service.action(rid, "u0", "start", {})
    version = first["room"]["phaseVersion"]
    assert service.action(rid, "u1", "sync", {"phaseVersion": version})["room"]["phase"] == "topic"
    clock[0] = first["room"]["phaseEndsAt"] + 1
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda i: service.action(rid, f"u{i}", "sync", {"phaseVersion": version}), range(4)))
    assert all(r["room"]["phaseVersion"] == version + 1 for r in results)
    assert service.repository.read(rid)["room"]["phase"] == "initial"
    revision = service.repository.read(rid)["room"]["revision"]
    service.action(rid, "u1", "sync", {"phaseVersion": version})
    assert service.repository.read(rid)["room"]["revision"] == revision


def test_timeouts_recover_without_fabricating_submissions(game):
    service, clock = game
    rid = four_players(service)
    service.action(rid, "u0", "start", {})
    for _ in range(11):
        expire(service, clock, rid)
    result = service.read(rid, "u0")
    assert result["room"]["phase"] == "results"
    assert result["me"]["initialPosition"]["timedOut"] is True
    assert all(row["timedOut"] for row in result["rounds"]["claim"])
    assert result["results"]["me"]["total"] == 5  # Same unaccused-role condition for everyone.


def test_late_submission_advances_then_rejects(game):
    service, clock = game
    rid = four_players(service)
    current = start_and_assign(service, clock, rid)
    clock[0] = current["room"]["phaseEndsAt"] + 1
    with pytest.raises(HTTPException) as error:
        service.action(rid, "u0", "claim", {"text": "너무 늦었음"})
    assert error.value.status_code == 409
    assert service.read(rid, "u0")["room"]["phase"] == "claim_review"
    assert "u0" not in service.repository.read(rid)["submissions"]["claim"]


def test_host_transfer_after_stale_heartbeat(game):
    service, clock = game
    rid = four_players(service)
    clock[0] += 180_001
    response = service.action(rid, "u2", "sync", {})
    assert response["room"]["hostUid"] == "u2"


def test_ready_and_sync_update_public_revision(game):
    service, _ = game
    rid = four_players(service)
    before = service.read(rid, "u0")["room"]["revision"]
    ready = service.action(rid, "u1", "ready", {"ready": False})
    assert ready["room"]["revision"] == before + 1
    synced = service.action(rid, "u0", "sync", {})
    assert synced["room"]["revision"] == before + 2
