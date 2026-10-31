import pytest
from fastapi import HTTPException

from app.repositories.topics import load_topics
from app.services.phase_engine import PHASES
from conftest import STUDENTS, TEACHER, choose, expire, open_room, role_ids, started_room, to_phase


def test_complete_game_runs_in_order_and_ends_at_the_reveal(game):
    service, _ = game
    rid, uids = started_room(service)
    seen = ["lobby"]
    state = service.repository.read(rid)
    assert state["room"]["phase"] == "role"
    seen.append("role")
    for uid in uids:
        service.action(rid, uid, "confirm-role", {})
    assert service.repository.read(rid)["room"]["phase"] == "statement"
    seen.append("statement")
    for i, uid in enumerate(uids):
        result = service.post_text(rid, uid, "statement", {"text": f"저는 제 역할의 입장에서 {i}번 의견을 말합니다."})
        assert result["moderation"]["status"] == "published"
    state = service.repository.read(rid)
    assert state["room"]["phase"] == "event"
    seen.append("event")
    assert state["room"]["event"]["title"]
    assert [row["uid"] for row in state["rounds"]["statements"]] == uids  # Seat order.
    service.post_text(rid, uids[0], "response", {"kind": "response", "text": "사건에 대한 제 역할의 대응입니다."})
    service.post_text(rid, uids[1], "question", {"kind": "question", "text": "진짜 그렇게 생각하세요?", "targetUid": uids[0]})
    service.post_text(rid, uids[0], "answer", {"kind": "answer", "text": "네, 제 역할의 목표 때문이에요.", "targetUid": uids[1]})
    service.action(rid, TEACHER, "next", {})
    seen.append("rebuttal")
    service.post_text(rid, uids[2], "rebuttal", {"kind": "rebuttal", "text": "그 대응은 학생 의견을 충분히 듣지 않았다고 생각해요.", "targetUid": uids[0]})
    with pytest.raises(HTTPException):
        service.post_text(rid, uids[2], "response", {"kind": "response", "text": "사건 대응은 이전 단계 발언이에요."})
    service.action(rid, TEACHER, "next", {})
    seen.append("vote")
    state = service.repository.read(rid)
    switcher = next(u for u, p in state["privatePlayers"].items() if p["isSwitcher"])
    for uid in uids:
        target = switcher if uid != switcher else next(u for u in uids if u != switcher)
        service.action(rid, uid, "vote", {"targets": [target]})
    state = service.repository.read(rid)
    assert state["room"]["phase"] == "reveal"
    seen.append("reveal")
    reveal = state["rounds"]["reveal"]
    assert reveal["switchers"][0]["uid"] == switcher and reveal["outcome"] == "found"
    assert [m["kind"] for m in state["rounds"]["chat"]] == ["response", "question", "answer", "rebuttal"]
    service.action(rid, TEACHER, "end", {})
    seen.append("ended")
    assert seen == PHASES
    assert service.repository.read(rid)["room"]["phase"] == "ended"
    with pytest.raises(HTTPException):
        service.action(rid, TEACHER, "next", {})


def test_teacher_picks_any_of_six_topics_or_a_random_one(game):
    service, _ = game
    ids = {t["topicId"] for t in load_topics()}
    for topic_id in ids:
        room = service.create(TEACHER, {"topicId": topic_id})["room"]
        assert room["topicId"] == topic_id and "events" not in room["topic"]
    randoms = {service.create(TEACHER, {"randomTopic": True})["room"]["topicId"] for _ in range(60)}
    assert randoms <= ids and len(randoms) > 1
    with pytest.raises(HTTPException):
        service.create(TEACHER, {"topicId": "made_up_topic"})


def test_changing_topic_in_lobby_clears_role_preferences(game):
    service, _ = game
    rid, uids = open_room(service)
    choose(service, rid, {uids[0]: (0, 1)})
    before = service.repository.read(rid)["room"]["topicId"]
    room = service.action(rid, TEACHER, "settings", {"randomTopic": True})["room"]
    assert room["topicId"] != before
    state = service.repository.read(rid)
    assert state["privatePlayers"][uids[0]]["preferences"] is None
    assert state["participants"][uids[0]]["prefsDone"] is False
    assert state["host"]["teacherGuide"] == next(t for t in load_topics() if t["topicId"] == room["topicId"])["teacherGuide"]


def test_start_needs_six_to_eight_students_with_preferences(game):
    service, _ = game
    rid, uids = open_room(service, count=5)
    choose(service, rid, {uid: (0, 1) for uid in uids})
    with pytest.raises(HTTPException) as error:
        service.action(rid, TEACHER, "start", {})
    assert "6~8명" in error.value.detail
    code = service.repository.read(rid)["room"]["code"]
    for uid in STUDENTS[5:8]:
        service.join(uid, {"nickname": f"추가{uid}", "code": code})
    with pytest.raises(HTTPException) as error:
        service.join("late", {"nickname": "아홉번째", "code": code})
    assert "최대 8명" in error.value.detail
    with pytest.raises(HTTPException) as error:
        service.action(rid, TEACHER, "start", {})
    assert "선호 역할" in error.value.detail
    choose(service, rid, {uid: (2, 3) for uid in STUDENTS[5:8]})
    assert service.action(rid, TEACHER, "start", {})["room"]["phase"] == "role"


def test_preferences_must_be_two_different_roles_of_this_topic(client, game):
    service, _ = game
    api, actor = client
    rid, uids = open_room(service)
    roles = role_ids(service, rid)
    actor[0] = uids[0]
    assert api.post(f"/api/rooms/{rid}/preferences", json={"first": roles[0], "second": roles[0]}).status_code == 422
    assert api.post(f"/api/rooms/{rid}/preferences", json={"first": roles[0], "second": "other_topic_role"}).status_code == 422
    assert api.post(f"/api/rooms/{rid}/preferences", json={"first": roles[0], "second": roles[1]}).status_code == 200


def test_only_the_teacher_runs_the_game_and_only_students_play(client, game):
    service, _ = game
    api, actor = client
    rid, uids = open_room(service)
    choose(service, rid, {uid: (0, 1) for uid in uids})
    actor[0] = uids[0]
    for path, body in [("start", {}), ("pause", {}), ("next", {}), ("settings", {"switcherCount": 2}), ("kick", {"targetUid": uids[1]}), ("review", {"entryId": "m1", "decision": "approve"})]:
        assert api.post(f"/api/rooms/{rid}/{path}", json=body).status_code == 403, path
    actor[0] = TEACHER
    assert api.post(f"/api/rooms/{rid}/preferences", json={"first": role_ids(service, rid)[0], "second": role_ids(service, rid)[1]}).status_code == 403
    assert api.post(f"/api/rooms/{rid}/start", json={}).status_code == 200
    assert api.post(f"/api/rooms/{rid}/statement", json={"text": "선생님 발언"}).status_code == 403
    code = service.repository.read(rid)["room"]["code"]
    assert api.post("/api/rooms/join", json={"nickname": "선생님", "code": code}).status_code == 409


def test_reconnect_keeps_role_and_start_never_redraws(game):
    service, _ = game
    rid, uids = started_room(service)
    before = service.repository.read(rid)
    roles = {uid: p["roleId"] for uid, p in before["privatePlayers"].items()}
    service.action(rid, TEACHER, "start", {})  # Retried start.
    for uid in uids:
        again = service.join(uid, {"nickname": "다른이름", "code": before["room"]["code"]})
        assert again["me"]["roleId"] == roles[uid]
        assert again["room"]["phase"] == "role"
        assert again["me"]["isSwitcher"] == before["privatePlayers"][uid]["isSwitcher"]
    after = service.repository.read(rid)
    assert {uid: p["roleId"] for uid, p in after["privatePlayers"].items()} == roles
    assert after["participants"][uids[0]]["nickname"] == "학생0"
    with pytest.raises(HTTPException):
        service.join("newcomer", {"nickname": "새학생", "code": before["room"]["code"]})


def test_timeouts_never_stall_the_game(game):
    service, clock = game
    rid, uids = started_room(service)
    expire(service, clock, rid)  # Nobody confirmed the role.
    service.post_text(rid, uids[0], "statement", {"text": "저만 발표했어요."})
    state = expire(service, clock, rid)
    assert state["room"]["phase"] == "event"
    rows = state["rounds"]["statements"]
    assert rows[0]["text"] == "저만 발표했어요." and all(r.get("timedOut") for r in rows[1:])
    expire(service, clock, rid)
    expire(service, clock, rid)
    service.action(rid, uids[0], "vote", {"targets": [uids[1]]})
    state = expire(service, clock, rid)
    assert state["room"]["phase"] == "reveal"
    ballots = {b["uid"]: b for b in state["rounds"]["reveal"]["ballots"]}
    assert ballots[uids[0]]["voted"] and not ballots[uids[1]]["voted"]


def test_late_submission_after_deadline_is_rejected_and_phase_moves(game):
    service, clock = game
    rid, uids = started_room(service)
    to_phase(service, rid, "statement")
    clock[0] = service.repository.read(rid)["room"]["phaseEndsAt"] + 5
    with pytest.raises(HTTPException) as error:
        service.post_text(rid, uids[0], "statement", {"text": "늦었어요"})
    assert error.value.status_code == 409


def test_pause_freezes_timer_and_submissions(game):
    service, clock = game
    rid, uids = started_room(service)
    to_phase(service, rid, "statement")
    remaining = service.repository.read(rid)["room"]["phaseEndsAt"] - clock[0]
    service.action(rid, TEACHER, "pause", {})
    clock[0] += 10 * 60 * 1000
    state = service.action(rid, TEACHER, "sync", {"phaseVersion": service.repository.read(rid)["room"]["phaseVersion"]})
    assert state["room"]["phase"] == "statement" and state["room"]["paused"]
    with pytest.raises(HTTPException) as error:
        service.post_text(rid, uids[0], "statement", {"text": "멈춘 동안"})
    assert "멈췄" in error.value.detail
    room = service.action(rid, TEACHER, "resume", {})["room"]
    assert room["phaseEndsAt"] - clock[0] == remaining
    room = service.action(rid, TEACHER, "extend", {"seconds": 60})["room"]
    assert room["phaseEndsAt"] - clock[0] == remaining + 60_000


def test_teacher_can_tune_phase_seconds_and_remove_students_in_lobby(game):
    service, clock = game
    rid, uids = open_room(service, count=7)
    service.action(rid, TEACHER, "settings", {"phaseSeconds": {"statement": 60}})
    with pytest.raises(HTTPException):
        service.action(rid, TEACHER, "settings", {"phaseSeconds": {"statement": 5}})
    service.action(rid, TEACHER, "kick", {"targetUid": uids[3]})
    state = service.repository.read(rid)
    assert uids[3] not in state["participants"] and uids[3] not in state["privatePlayers"]
    assert sorted(p["seat"] for p in state["participants"].values()) == list(range(6))
    rest = [u for u in uids if u != uids[3]]
    choose(service, rid, {uid: (0, 1) for uid in rest})
    service.action(rid, TEACHER, "start", {})
    to_phase(service, rid, "statement")
    assert service.repository.read(rid)["room"]["phaseEndsAt"] == clock[0] + 60_000
    with pytest.raises(HTTPException):
        service.action(rid, TEACHER, "kick", {"targetUid": rest[0]})


def test_vote_rules(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "vote")
    for targets in ([uids[0]], [uids[1], uids[2]], []):
        with pytest.raises(HTTPException):
            service.action(rid, uids[0], "vote", {"targets": targets})
    with pytest.raises(HTTPException):
        service.action(rid, uids[0], "vote", {"targets": [TEACHER]})
    service.action(rid, uids[0], "vote", {"targets": [uids[1]]})
    service.action(rid, uids[0], "vote", {"targets": [uids[1]]})  # Idempotent retry.
    with pytest.raises(HTTPException):
        service.action(rid, uids[0], "vote", {"targets": [uids[2]]})


def test_two_switchers_two_distinct_votes(game):
    service, _ = game
    prefs = {uid: (0, 1) if i < 4 else (2, 3) for i, uid in enumerate(STUDENTS[:6])}
    rid, uids = started_room(service, switchers=2, prefs=prefs)
    state = service.repository.read(rid)
    switchers = sorted(u for u, p in state["privatePlayers"].items() if p["isSwitcher"])
    assert len(switchers) == 2 and all(prefs[u][0] == 0 for u in switchers)
    to_phase(service, rid, "vote")
    with pytest.raises(HTTPException):
        service.action(rid, uids[0], "vote", {"targets": [uids[1]]})
    for uid in uids:
        others = [u for u in switchers if u != uid] + [u for u in uids if u != uid and u not in switchers]
        service.action(rid, uid, "vote", {"targets": others[:2]})
    reveal = service.repository.read(rid)["rounds"]["reveal"]
    assert sorted(s["uid"] for s in reveal["switchers"]) == switchers
    assert reveal["switcherCount"] == 2


def test_vote_tie_is_reported_without_inventing_a_winner(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "vote")
    # Three votes each for uids[0] and uids[1].
    plan = {uids[0]: uids[1], uids[1]: uids[0], uids[2]: uids[0], uids[3]: uids[1], uids[4]: uids[0], uids[5]: uids[1]}
    for voter, target in plan.items():
        service.action(rid, voter, "vote", {"targets": [target]})
    reveal = service.repository.read(rid)["rounds"]["reveal"]
    assert reveal["tie"] is True and reveal["outcome"] == "tie"
    assert reveal["topVoted"] == [] and sorted(reveal["tiedUids"]) == sorted(uids[:2])


def test_no_hidden_opinion_step_after_the_reveal(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "reveal")
    state = service.action(rid, TEACHER, "end", {})
    assert state["room"]["phase"] == "ended"
    for forbidden in ("reflection", "results", "initialPosition", "finalOpinion", "ratings", "score"):
        assert forbidden not in str(service.repository.read(rid))
