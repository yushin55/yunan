"""Each section opens with its title on every screen; the event card is read by all before questions."""
import pytest
from fastapi import HTTPException

from app.services.phase_engine import HOLD_MS
from tests.conftest import TEACHER, started_room, to_phase

pytestmark = pytest.mark.hold


def mic(service, rid, uid, kind):
    return service.action(rid, uid, "mic-on", {"kind": kind})


def refused(service, rid, uid, kind):
    with pytest.raises(HTTPException):
        mic(service, rid, uid, kind)


def test_nobody_talks_until_the_section_title_is_gone(game):
    service, clock = game
    rid, uids = started_room(service)
    to_phase(service, rid, "statement")
    room = service.repository.read(rid)["room"]
    assert room["holdUntil"] == clock[0] + HOLD_MS
    # The hold does not eat into the first speaker's time.
    assert room["phaseEndsAt"] == clock[0] + HOLD_MS + room["settings"]["phaseSeconds"]["statement"] * 1000
    first = room["turn"]["uid"]
    refused(service, rid, first, "statement")
    clock[0] += HOLD_MS
    assert mic(service, rid, first, "statement")["room"]["floor"]["uid"] == first


def test_questions_after_the_statements_get_their_own_title(game):
    service, clock = game
    rid, uids = started_room(service)
    to_phase(service, rid, "statement")
    while service.repository.read(rid)["room"]["turn"]["stage"] != "qa":
        service.action(rid, TEACHER, "next", {})
    assert service.repository.read(rid)["room"]["holdUntil"] == clock[0] + HOLD_MS
    refused(service, rid, uids[0], "question")
    clock[0] += HOLD_MS
    assert mic(service, rid, uids[0], "question")["room"]["floor"]["kind"] == "question"


def test_questions_wait_until_everyone_has_read_the_event_card(game):
    service, clock = game
    rid, uids = started_room(service)
    while service.repository.read(rid)["room"]["phase"] != "event":
        service.action(rid, TEACHER, "next", {})
    assert service.repository.read(rid)["room"]["reading"] is True
    for uid in uids[:-1]:
        service.action(rid, uid, "read-event", {})
    clock[0] += 60_000
    # One student is still reading: nobody can ask yet, not even those who finished.
    refused(service, rid, uids[0], "question")
    room = service.action(rid, uids[-1], "read-event", {})["room"]
    assert room["reading"] is False and room["holdUntil"] == clock[0] + HOLD_MS
    # The clock starts over once the questions open: reading time is not question time.
    assert room["phaseEndsAt"] == clock[0] + HOLD_MS + room["settings"]["phaseSeconds"]["event"] * 1000
    refused(service, rid, uids[0], "question")
    clock[0] += HOLD_MS
    assert mic(service, rid, uids[0], "question")["room"]["floor"]["uid"] == uids[0]


def test_the_teacher_can_open_questions_without_waiting(game):
    service, clock = game
    rid, uids = started_room(service)
    while service.repository.read(rid)["room"]["phase"] != "event":
        service.action(rid, TEACHER, "next", {})
    service.action(rid, uids[0], "read-event", {})
    with pytest.raises(HTTPException):
        service.action(rid, uids[0], "open-questions", {})  # Teachers only.
    room = service.action(rid, TEACHER, "open-questions", {})["room"]
    assert room["reading"] is False
    clock[0] += HOLD_MS
    assert mic(service, rid, uids[1], "question")["room"]["floor"]["uid"] == uids[1]


def test_reading_while_paused_still_counts(game):
    service, clock = game
    rid, uids = started_room(service)
    to_phase(service, rid, "statement")
    while service.repository.read(rid)["room"]["phase"] != "event":
        service.action(rid, TEACHER, "next", {})
    service.action(rid, TEACHER, "pause", {})
    for uid in uids:
        service.action(rid, uid, "read-event", {})
    room = service.repository.read(rid)["room"]
    assert room["reading"] is False and room["paused"] is True
    assert room["pausedRemainingMs"] == HOLD_MS + room["settings"]["phaseSeconds"]["event"] * 1000
