"""Students talk into their own device, one microphone at a time; what they say is written down."""
import base64
import json

import pytest
from fastapi import HTTPException

from app.services.ai import AIUnavailable
from app.services.discussion import build_summary, transcribe
from app.services.moderation import Moderator
from conftest import TEACHER, started_room, to_phase

AUDIO = base64.b64encode(b"RIFF....WAVE").decode()


def clip(service, rid, uid, text, version, number=None):
    service.transcriber = lambda audio, mime: text
    return service.speech(rid, uid, {"audio": AUDIO, "mimeType": "audio/wav", "phaseVersion": version, "clip": number})


def speak(service, rid, text):
    """Whoever's turn it is switches their microphone on, if it isn't yet, and says this."""
    room = service.repository.read(rid)["room"]
    if not room["floor"]:
        room = service.action(rid, room["turn"]["uid"], "mic-on", {"kind": "statement"})["room"]
    return clip(service, rid, room["floor"]["uid"], text, room["phaseVersion"])


def floor(service, rid):
    return service.repository.read(rid)["room"]["turn"]


def in_statement(service):
    rid, uids = started_room(service)
    to_phase(service, rid, "statement")
    return rid, uids


def in_open_floor(service, phase="event"):
    rid, uids = started_room(service)
    to_phase(service, rid, phase)
    return rid, uids


def refused(service, rid, uid, kind):
    with pytest.raises(HTTPException) as error:
        service.action(rid, uid, "mic-on", {"kind": kind})
    return error.value


def test_statements_go_in_seat_order_then_the_floor_opens(game):
    service, clock = game
    rid, uids = in_statement(service)
    spoken = []
    seconds = service.repository.read(rid)["room"]["settings"]["phaseSeconds"]["statement"]
    for _ in uids:
        room = service.repository.read(rid)["room"]
        assert room["phase"] == "statement" and room["phaseEndsAt"] == clock[0] + seconds * 1000
        spoken.append(room["turn"]["uid"])
        service.action(rid, TEACHER, "next", {})
    assert spoken == uids
    room = service.repository.read(rid)["room"]
    assert room["phase"] == "event" and room["event"]["title"]
    assert room["turn"] is None and room["floor"] is None  # Nobody's turn now: whoever has a question goes first.


def test_only_the_student_whose_turn_it_is_can_switch_on_during_statements(game):
    service, _ = game
    rid, uids = in_statement(service)
    assert "내 차례" in refused(service, rid, uids[1], "statement").detail
    assert refused(service, rid, uids[0], "question").status_code == 409  # Questions come later.
    version = service.repository.read(rid)["room"]["phaseVersion"]
    room = service.action(rid, uids[0], "mic-on", {"kind": "statement"})["room"]
    assert room["floor"]["uid"] == uids[0] and room["phaseVersion"] == version  # Still the same turn.
    assert room["floor"]["endsAt"] == room["phaseEndsAt"]  # The turn's time is the microphone's time.
    service.action(rid, uids[0], "mic-on", {"kind": "statement"})  # A retry is harmless.
    room = service.action(rid, uids[0], "end-turn", {})["room"]
    assert room["floor"] is None and room["turn"]["uid"] == uids[1]


def test_switching_off_keeps_the_turn_so_a_reload_can_carry_on(game):
    service, _ = game
    rid, uids = in_statement(service)
    service.action(rid, uids[0], "mic-on", {"kind": "statement"})
    room = service.action(rid, uids[0], "mic-off", {})["room"]
    assert room["floor"] is None and room["turn"]["uid"] == uids[0]
    assert service.action(rid, uids[0], "mic-on", {"kind": "statement"})["room"]["floor"]["uid"] == uids[0]


def test_nobody_can_switch_on_while_someone_else_is_talking(game):
    service, _ = game
    rid, uids = in_open_floor(service)
    room = service.action(rid, uids[2], "mic-on", {"kind": "question"})["room"]
    assert room["floor"]["uid"] == uids[2]
    for other, kind in [(uids[0], "question"), (uids[1], "answer")]:
        error = refused(service, rid, other, kind)
        assert error.status_code == 409 and "학생2님이 말하고 있어요" in error.detail
    assert service.repository.read(rid)["room"]["floor"]["uid"] == uids[2]
    service.action(rid, uids[0], "mic-off", {})  # Someone else's off switch does nothing.
    assert service.repository.read(rid)["room"]["floor"]["uid"] == uids[2]
    service.action(rid, uids[2], "mic-off", {})
    assert service.action(rid, uids[1], "mic-on", {"kind": "answer"})["room"]["floor"]["uid"] == uids[1]


def test_only_the_first_press_gets_the_microphone(client, game):
    service, _ = game
    api, actor = client
    rid, uids = in_open_floor(service)
    answers = []
    for uid in uids[:3]:
        actor[0] = uid
        answers.append(api.post(f"/api/rooms/{rid}/mic-on", json={"kind": "question"}).status_code)
    assert answers == [200, 409, 409]


def test_the_time_limit_frees_the_microphone_even_if_the_speaker_vanishes(game):
    service, clock = game
    rid, uids = in_open_floor(service)
    seconds = service.repository.read(rid)["room"]["settings"]["micSeconds"]
    room = service.action(rid, uids[0], "mic-on", {"kind": "question"})["room"]
    assert room["floor"]["endsAt"] == clock[0] + seconds * 1000
    clock[0] = room["floor"]["endsAt"] - 1
    assert refused(service, rid, uids[1], "answer").status_code == 409
    clock[0] += 1  # uids[0]'s phone died; nobody has to wait for it.
    assert service.action(rid, uids[1], "mic-on", {"kind": "answer"})["room"]["floor"]["uid"] == uids[1]


def test_the_microphone_never_outlasts_the_phase(game):
    service, clock = game
    rid, uids = in_open_floor(service)
    ends = service.repository.read(rid)["room"]["phaseEndsAt"]
    clock[0] = ends - 5000
    assert service.action(rid, uids[0], "mic-on", {"kind": "question"})["room"]["floor"]["endsAt"] == ends
    clock[0] = ends
    state = service.action(rid, TEACHER, "sync", {})
    assert state["room"]["phase"] == "rebuttal" and state["room"]["floor"] is None


def test_each_phase_has_its_own_buttons(game):
    service, _ = game
    rid, uids = in_open_floor(service)
    assert refused(service, rid, uids[0], "rebuttal").status_code == 409
    assert refused(service, rid, uids[0], "statement").status_code == 409
    to_phase(service, rid, "rebuttal")
    assert refused(service, rid, uids[0], "question").status_code == 409
    assert service.action(rid, uids[0], "mic-on", {"kind": "rebuttal"})["room"]["floor"]["kind"] == "rebuttal"
    to_phase(service, rid, "vote")
    assert refused(service, rid, uids[1], "answer").status_code == 409


def test_questions_and_answers_are_recorded_under_the_name_and_kind(game):
    service, _ = game
    rid, uids = in_open_floor(service)
    for uid, kind, text in [(uids[3], "question", "급한 연락은 어떻게 하죠?"), (uids[1], "answer", "담임 선생님께 연락하면 돼요.")]:
        room = service.action(rid, uid, "mic-on", {"kind": kind})["room"]
        assert clip(service, rid, uid, text, room["phaseVersion"])["speech"] == "published"
        service.action(rid, uid, "mic-off", {})
    lines = service.repository.read(rid)["rounds"]["transcript"]
    assert [(l["uid"], l["kind"], l["phase"], l["text"]) for l in lines] == [(uids[3], "question", "event", "급한 연락은 어떻게 하죠?"), (uids[1], "answer", "event", "담임 선생님께 연락하면 돼요.")]
    assert lines[0]["turn"] != lines[1]["turn"]  # Two people, two blocks in the record.


def test_pause_switches_the_microphone_off(game):
    service, _ = game
    rid, uids = in_open_floor(service)
    service.action(rid, uids[0], "mic-on", {"kind": "question"})
    assert service.action(rid, TEACHER, "pause", {})["room"]["floor"] is None
    assert "멈췄" in refused(service, rid, uids[0], "question").detail
    service.action(rid, uids[0], "mic-off", {})  # A device catching up gets no error.
    service.action(rid, TEACHER, "resume", {})
    assert service.action(rid, uids[1], "mic-on", {"kind": "question"})["room"]["floor"]["uid"] == uids[1]


def test_extending_a_turn_extends_its_microphone(game):
    service, clock = game
    rid, uids = in_statement(service)
    service.action(rid, uids[0], "mic-on", {"kind": "statement"})
    room = service.action(rid, TEACHER, "extend", {"seconds": 60})["room"]
    assert room["floor"]["endsAt"] == room["phaseEndsAt"]
    clock[0] = room["phaseEndsAt"] - 1000
    assert clip(service, rid, uids[0], "연장한 시간에 한 말", room["phaseVersion"])["speech"] == "published"


def test_teacher_sets_how_long_one_person_can_talk(game):
    service, clock = game
    rid, uids = started_room(service)
    room = service.create(TEACHER, {"topicId": "smartphone_class", "micSeconds": 45})["room"]
    assert room["settings"]["micSeconds"] == 45
    to_phase(service, rid, "event")
    assert service.action(rid, uids[0], "mic-on", {"kind": "question"})["room"]["floor"]["endsAt"] == clock[0] + service.repository.read(rid)["room"]["settings"]["micSeconds"] * 1000


def test_mic_time_limit_is_checked(client, game):
    service, _ = game
    api, actor = client
    rid, uids = in_open_floor(service)
    room = service.create(TEACHER, {"topicId": "smartphone_class"})["room"]["roomId"]
    for seconds, status in [(5, 422), (121, 422), (10, 200), (120, 200)]:
        assert api.post(f"/api/rooms/{room}/settings", json={"micSeconds": seconds}).status_code == status, seconds
    assert api.post(f"/api/rooms/{rid}/mic-on", json={"kind": "shout"}).status_code == 422
    assert api.post(f"/api/rooms/{rid}/mic-on", json={"kind": "question"}).status_code == 403  # Teachers have no microphone.
    actor[0] = "stranger"
    assert api.post(f"/api/rooms/{rid}/mic-on", json={"kind": "question"}).status_code == 403


def test_time_running_out_passes_the_floor_automatically(game):
    service, clock = game
    rid, uids = in_statement(service)
    version = service.repository.read(rid)["room"]["phaseVersion"]
    clock[0] = service.repository.read(rid)["room"]["phaseEndsAt"] + 1
    state = service.action(rid, uids[3], "sync", {"phaseVersion": version})
    assert state["room"]["turn"]["uid"] == uids[1]
    assert state["room"]["phaseVersion"] == version + 1
    # A second client with the same deadline does not skip another speaker.
    assert service.action(rid, uids[4], "sync", {"phaseVersion": version})["room"]["turn"]["uid"] == uids[1]


def test_only_the_speaker_can_finish_their_own_turn(game):
    service, _ = game
    rid, uids = in_statement(service)
    version = service.repository.read(rid)["room"]["phaseVersion"]
    service.action(rid, uids[2], "end-turn", {"phaseVersion": version})
    assert floor(service, rid)["uid"] == uids[0]
    service.action(rid, uids[0], "end-turn", {"phaseVersion": version})
    assert floor(service, rid)["uid"] == uids[1]
    service.action(rid, uids[0], "end-turn", {"phaseVersion": version})  # Double tap.
    assert floor(service, rid)["uid"] == uids[1]


def test_pause_freezes_the_turn_and_extend_adds_to_it(game):
    service, clock = game
    rid, uids = in_statement(service)
    remaining = service.repository.read(rid)["room"]["phaseEndsAt"] - clock[0]
    service.action(rid, TEACHER, "pause", {})
    clock[0] += 10 * 60 * 1000
    room = service.action(rid, TEACHER, "sync", {"phaseVersion": service.repository.read(rid)["room"]["phaseVersion"]})["room"]
    assert room["paused"] and room["turn"]["uid"] == uids[0]
    with pytest.raises(HTTPException) as error:
        service.action(rid, uids[0], "end-turn", {})
    assert "멈췄" in error.value.detail
    room = service.action(rid, TEACHER, "resume", {})["room"]
    assert room["phaseEndsAt"] - clock[0] == remaining
    room = service.action(rid, TEACHER, "extend", {"seconds": 60})["room"]
    assert room["phaseEndsAt"] - clock[0] == remaining + 60_000


def test_teacher_can_call_on_someone_and_the_queue_carries_on(game):
    service, _ = game
    rid, uids = in_statement(service)
    version = service.repository.read(rid)["room"]["phaseVersion"]
    service.action(rid, TEACHER, "speaker", {"targetUid": uids[3], "phaseVersion": version})
    turn = floor(service, rid)
    assert turn["uid"] == uids[3]
    assert turn["order"] == [uids[0], uids[3], uids[1], uids[2], uids[4], uids[5]]  # Nobody speaks twice by accident.
    service.action(rid, TEACHER, "speaker", {"targetUid": uids[4], "phaseVersion": version})  # Stale double click.
    assert floor(service, rid)["uid"] == uids[3]
    service.action(rid, TEACHER, "next", {})
    assert floor(service, rid)["uid"] == uids[1]
    with pytest.raises(HTTPException):
        service.action(rid, TEACHER, "speaker", {"targetUid": "stranger"})
    to_phase(service, rid, "event")
    with pytest.raises(HTTPException):  # The floor is open: nobody needs calling on.
        service.action(rid, TEACHER, "speaker", {"targetUid": uids[1]})


def test_skipping_a_phase_jumps_past_the_remaining_turns(game):
    service, _ = game
    rid, uids = in_statement(service)
    room = service.action(rid, TEACHER, "skip-phase", {"phaseVersion": service.repository.read(rid)["room"]["phaseVersion"]})["room"]
    assert room["phase"] == "event" and room["event"]["title"]
    service.action(rid, TEACHER, "skip-phase", {"phaseVersion": 0})  # Stale click does nothing.
    assert service.repository.read(rid)["room"]["phase"] == "event"


def test_speech_goes_to_whoever_held_the_floor_when_it_was_recorded(game):
    service, _ = game
    rid, uids = in_statement(service)
    recorded_during = service.action(rid, uids[0], "mic-on", {"kind": "statement"})["room"]["phaseVersion"]
    service.action(rid, TEACHER, "next", {})  # The floor moved while the audio was uploading.
    result = clip(service, rid, uids[0], "제 역할에게는 안전이 가장 중요합니다.", recorded_during)
    assert result["speech"] == "published"
    line = service.repository.read(rid)["rounds"]["transcript"][0]
    assert line["uid"] == uids[0] and line["phase"] == "statement" and line["kind"] == "statement" and line["source"] == "voice" and line["turn"] == recorded_during
    speak(service, rid, "저는 조금 다르게 생각해요.")
    assert service.repository.read(rid)["rounds"]["transcript"][1]["uid"] == uids[1]


def test_clips_arriving_out_of_order_keep_the_order_they_were_said(game):
    service, _ = game
    rid, uids = in_statement(service)
    version = service.action(rid, uids[0], "mic-on", {"kind": "statement"})["room"]["phaseVersion"]
    for number, text in [(2, "두 번째"), (3, "세 번째"), (1, "첫 번째")]:
        clip(service, rid, uids[0], text, version, number)
    service.add_line(rid, TEACHER, {"text": "직접 넣은 말"})
    service.action(rid, TEACHER, "next", {})
    following = service.action(rid, uids[1], "mic-on", {"kind": "statement"})["room"]["phaseVersion"]
    clip(service, rid, uids[1], "다음 차례", following, 5)
    clip(service, rid, uids[0], "앞 차례의 늦은 말", version, 4)
    assert [l["text"] for l in service.repository.read(rid)["rounds"]["transcript"]] == ["첫 번째", "두 번째", "세 번째", "앞 차례의 늦은 말", "직접 넣은 말", "다음 차례"]


def test_audio_is_never_stored_and_silence_adds_nothing(game):
    service, _ = game
    rid, _ = in_statement(service)
    assert speak(service, rid, "")["speech"] == "silent"
    state = service.repository.read(rid)
    assert state["rounds"]["transcript"] == []
    speak(service, rid, "기록될 말")
    assert AUDIO not in json.dumps(service.repository.read(rid), ensure_ascii=False)


def test_only_the_student_holding_the_microphone_can_send_audio(client, game):
    service, clock = game
    api, actor = client
    rid, uids = started_room(service)
    service.transcriber = lambda audio, mime: "말"
    body = {"audio": AUDIO, "mimeType": "audio/wav", "phaseVersion": service.repository.read(rid)["room"]["phaseVersion"]}
    actor[0] = uids[0]
    assert api.post(f"/api/rooms/{rid}/speech", json=body).status_code == 409  # Nobody has the floor yet.
    to_phase(service, rid, "statement")
    body["phaseVersion"] = service.repository.read(rid)["room"]["phaseVersion"]
    assert api.post(f"/api/rooms/{rid}/speech", json=body).status_code == 409  # My turn, but the microphone is off.
    service.action(rid, uids[0], "mic-on", {"kind": "statement"})
    assert api.post(f"/api/rooms/{rid}/speech", json={**body, "mimeType": "video/mp4"}).status_code == 422
    assert api.post(f"/api/rooms/{rid}/speech", json={**body, "audio": "not base64!"}).status_code == 422
    assert api.post(f"/api/rooms/{rid}/speech", json={**body, "audio": "A" * 2_000_004}).status_code == 422
    assert api.post(f"/api/rooms/{rid}/speech", json=body).status_code == 200
    # Long after the turn ended the record is closed, so an old turn can't be used to keep talking.
    clock[0] = service.repository.read(rid)["room"]["floor"]["endsAt"] + 91_000
    assert api.post(f"/api/rooms/{rid}/speech", json=body).status_code == 409
    for who in (uids[1], TEACHER, "stranger"):
        actor[0] = who
        assert api.post(f"/api/rooms/{rid}/speech", json=body).status_code == 403, who
    actor[0] = uids[0]
    for path, payload in [("line-add", {"text": "내가 쓴 발언"}), ("line-edit", {"lineId": "m1", "text": "고침"}), ("line-delete", {"lineId": "m1"}), ("speaker", {"targetUid": uids[1]}), ("skip-phase", {}), ("summary", {})]:
        assert api.post(f"/api/rooms/{rid}/{path}", json=payload).status_code == 403, path


def test_transcription_outage_is_reported_and_stores_nothing(game):
    service, _ = game
    rid, uids = in_statement(service)
    version = service.action(rid, uids[0], "mic-on", {"kind": "statement"})["room"]["phaseVersion"]
    service.transcriber = lambda audio, mime: (_ for _ in ()).throw(AIUnavailable("down"))
    with pytest.raises(HTTPException) as error:
        service.speech(rid, uids[0], {"audio": AUDIO, "mimeType": "audio/wav", "phaseVersion": version})
    assert error.value.status_code == 503
    assert service.repository.read(rid)["rounds"]["transcript"] == []


def test_rude_speech_waits_for_the_teacher_and_never_reaches_the_shared_record(game):
    service, _ = game
    rid, uids = in_statement(service)
    assert speak(service, rid, "너 진짜 멍청하다")["speech"] == "held"
    state = service.repository.read(rid)
    assert state["rounds"]["transcript"] == []
    entry = state["host"]["moderation"][-1]
    assert entry["status"] == "flagged" and entry["uid"] == uids[0] and entry["category"] == "personal_attack"
    assert "멍청" not in json.dumps({k: v for k, v in service.read(rid, uids[1]).items()}, ensure_ascii=False)
    service.action(rid, TEACHER, "review", {"entryId": entry["id"], "decision": "return"})
    assert service.repository.read(rid)["rounds"]["transcript"] == []
    assert uids[0] in service.repository.read(rid)["participants"]  # Nobody is removed automatically.
    with pytest.raises(HTTPException):
        service.action(rid, TEACHER, "review", {"entryId": entry["id"], "decision": "approve"})


def test_moderation_outage_holds_the_line_and_approval_keeps_its_place(game):
    service, _ = game
    rid, uids = in_statement(service)
    service.moderator = Moderator(mode="ai", ai_call=lambda prompt: (_ for _ in ()).throw(AIUnavailable("down")))
    assert speak(service, rid, "먼저 한 말")["speech"] == "held"
    service.moderator = Moderator(mode="rules")
    speak(service, rid, "나중에 한 말")
    entry = service.read(rid, TEACHER)["host"]["moderation"][0]
    assert entry["status"] == "pending_review"
    service.action(rid, TEACHER, "review", {"entryId": entry["id"], "decision": "approve"})
    lines = service.repository.read(rid)["rounds"]["transcript"]
    assert [l["text"] for l in lines] == ["먼저 한 말", "나중에 한 말"]
    assert lines[0]["viaTeacher"] is True


def test_teacher_corrects_recognition_mistakes_and_types_what_was_missed(game):
    service, _ = game
    rid, uids = in_statement(service)
    speak(service, rid, "학교 시시티비는 늘려야 합니다")
    line = service.repository.read(rid)["rounds"]["transcript"][0]
    service.action(rid, TEACHER, "line-edit", {"lineId": line["id"], "text": "학교 CCTV는 늘려야 합니다"})
    assert service.repository.read(rid)["rounds"]["transcript"][0]["text"] == "학교 CCTV는 늘려야 합니다"
    service.add_line(rid, TEACHER, {"text": "마이크가 놓친 말"})
    lines = service.repository.read(rid)["rounds"]["transcript"]
    assert lines[1]["source"] == "typed" and lines[1]["uid"] == uids[0]
    service.action(rid, TEACHER, "line-delete", {"lineId": line["id"]})
    assert [l["text"] for l in service.repository.read(rid)["rounds"]["transcript"]] == ["마이크가 놓친 말"]
    with pytest.raises(HTTPException):
        service.action(rid, TEACHER, "line-edit", {"lineId": line["id"], "text": "지운 줄"})
    to_phase(service, rid, "vote")
    with pytest.raises(HTTPException):
        service.add_line(rid, TEACHER, {"text": "말하는 단계가 아님"})


def test_summary_sees_only_roles_and_published_words(game):
    service, _ = game
    rid, uids = in_statement(service)
    speak(service, rid, "안전이 먼저입니다")
    speak(service, rid, "너 진짜 멍청하다")  # Held back.
    seen = {}

    def summarizer(topic, lines):
        seen["lines"] = lines
        return {"positions": [{"roleId": topic["roles"][0]["id"], "points": ["안전 우선"]}], "clashes": [], "questions": [], "source": "ai"}

    service.summarizer = summarizer
    result = service.summarize(rid, TEACHER)
    assert result["rounds"]["summary"]["positions"][0]["points"] == ["안전 우선"]
    assert [l["text"] for l in seen["lines"]] == ["안전이 먼저입니다"]
    assert all(set(l) == {"roleId", "speaker", "phase", "kind", "text"} for l in seen["lines"])  # No uid, nickname or secret.
    # Roles only become public after the role phase, and switcher status is never passed.
    state = service.repository.read(rid)
    assert seen["lines"][0]["roleId"] == state["participants"][uids[0]]["roleId"]


def test_each_statement_gets_its_own_card_for_the_person_who_said_it(game):
    service, _ = game
    rid, uids = in_statement(service)
    speak(service, rid, "안전이 먼저입니다")
    service.action(rid, TEACHER, "next", {})
    speak(service, rid, "사생활도 중요합니다")
    seen = {}

    def summarizer(topic, lines):
        seen["speakers"] = [l["speaker"] for l in lines]
        return {"positions": [{"roleId": topic["roles"][0]["id"], "points": ["요점"]}], "clashes": [], "questions": [],
                "statements": [{"speaker": 2, "text": "사생활 보호"}, {"speaker": 1, "text": "안전 우선"}, {"speaker": 99, "text": "없는 사람"}], "source": "ai"}

    service.summarizer = summarizer
    summary = service.summarize(rid, TEACHER)["rounds"]["summary"]
    assert seen["speakers"] == [1, 2]  # Seat numbers, not names.
    assert summary["statements"] == [{"uid": uids[1], "text": "사생활 보호"}, {"uid": uids[0], "text": "안전 우선"}]


def test_summary_runs_only_when_the_record_changed(game):
    service, _ = game
    rid, _ = in_statement(service)
    calls = []

    def summarizer(topic, lines):
        calls.append(len(lines))
        return {"positions": [{"roleId": topic["roles"][0]["id"], "points": ["요점"]}], "clashes": [], "questions": [], "source": "ai"}

    service.summarizer = summarizer
    service.summarize(rid, TEACHER)
    assert calls == []  # Nothing said yet.
    speak(service, rid, "첫 발언")
    service.summarize(rid, TEACHER)
    service.summarize(rid, TEACHER)
    assert calls == [1]
    line = service.repository.read(rid)["rounds"]["transcript"][0]
    service.action(rid, TEACHER, "line-edit", {"lineId": line["id"], "text": "고친 발언"})
    service.summarize(rid, TEACHER)
    assert calls == [1, 1]


def test_summary_outage_keeps_the_record(game):
    service, _ = game
    rid, _ = in_statement(service)
    speak(service, rid, "기록은 남아요")
    service.summarizer = lambda topic, lines: (_ for _ in ()).throw(AIUnavailable("down"))
    with pytest.raises(HTTPException) as error:
        service.summarize(rid, TEACHER)
    assert error.value.status_code == 503
    assert len(service.repository.read(rid)["rounds"]["transcript"]) == 1


TOPIC = {"title": "주제", "roles": [{"id": "a", "name": "학생회 대표"}, {"id": "b", "name": "학부모"}]}


def test_summary_prompt_has_no_people_and_bad_ai_output_is_filtered():
    prompts = []

    def ai(prompt, timeout, max_tokens):
        prompts.append(prompt)
        return {
            "positions": [{"role": "학생회 대표", "points": ["규칙은 함께 정해요", "닥쳐"]}, {"role": "만들어 낸 역할", "points": ["무시"]}, "이상한 값"],
            "clashes": ["자율과 안전", 3],
            "questions": "질문 아님",
        }

    summary = build_summary(TOPIC, [{"roleId": "a", "speaker": 3, "phase": "statement", "kind": "statement", "text": "함께 정해요"}, {"roleId": "b", "speaker": 4, "phase": "event", "kind": "question", "text": "누가 정하나요?"}], ai_call=ai)
    assert summary["positions"] == [{"roleId": "a", "points": ["규칙은 함께 정해요"]}]
    assert summary["clashes"] == ["자율과 안전"] and summary["questions"] == []
    assert "[입장 발표 3번] 학생회 대표: 함께 정해요" in prompts[0] and "[질문] 학부모: 누가 정하나요?" in prompts[0] and "수상한지" in prompts[0]


def test_statement_cards_only_keep_clean_lines_for_people_who_spoke():
    def ai(prompt, timeout, max_tokens):
        return {
            "positions": [{"role": "학생회 대표", "points": ["요점"]}],
            "statements": [{"speaker": 3, "text": "규칙은 함께 정해요"}, {"speaker": 4, "text": "말하지 않은 사람"}, {"speaker": 3, "text": "닥쳐"}, {"speaker": "3", "text": "번호가 글자"}, "이상한 값"],
        }

    summary = build_summary(TOPIC, [{"roleId": "a", "speaker": 3, "phase": "statement", "kind": "statement", "text": "함께 정해요"}], ai_call=ai)
    assert summary["statements"] == [{"speaker": 3, "text": "규칙은 함께 정해요"}]
    no_cards = build_summary(TOPIC, [{"roleId": "a", "speaker": 3, "phase": "statement", "kind": "statement", "text": "함께 정해요"}], ai_call=lambda prompt, timeout, max_tokens: {"positions": [{"role": "학생회 대표", "points": ["요점"]}]})
    assert no_cards["statements"] == []


def test_empty_summary_counts_as_a_failure():
    with pytest.raises(AIUnavailable):
        build_summary(TOPIC, [{"roleId": "a", "speaker": 1, "phase": "event", "kind": "answer", "text": "말"}], ai_call=lambda prompt, timeout, max_tokens: {"positions": []})


def test_transcribe_returns_clean_text_or_nothing():
    assert transcribe(AUDIO, "audio/wav", ai_call=lambda p, a, m: {"text": " 안녕하세요\x01 "}) == "안녕하세요"
    assert transcribe(AUDIO, "audio/wav", ai_call=lambda p, a, m: {"text": None}) == ""
    assert transcribe(AUDIO, "audio/wav", ai_call=lambda p, a, m: {}) == ""
