"""Secrets are separated by document, not hidden by the UI."""
import json

from app.repositories.rooms import projections
from conftest import TEACHER, open_room, choose, started_room, to_phase

SECRET_KEYS = ("preferences", "isSwitcher", "preferenceRank", "assignment", "votes", "topRoleId", "tiedRoleIds", "eventCard")


def public_documents(state):
    """Every document some other student or the teacher can read (see firestore.rules)."""
    docs = projections(state)
    return {path: doc for path, doc in docs.items() if path == "" or path.startswith(("participants/", "publicRounds/", "host/"))}


def keys_in(value):
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from keys_in(item)
    elif isinstance(value, list):
        for item in value:
            yield from keys_in(item)


def test_no_preferences_or_switcher_status_in_shared_documents_before_reveal(game):
    service, _ = game
    rid, uids = started_room(service)
    for phase in ("role", "statement", "event", "rebuttal", "vote"):
        to_phase(service, rid, phase)
        state = service.repository.read(rid)
        for path, doc in public_documents(state).items():
            leaked = set(keys_in(doc)) & set(SECRET_KEYS)
            assert not leaked, (phase, path, leaked)
        assert "reveal" not in state["rounds"]


def test_private_documents_hold_only_their_own_student_data(game):
    service, _ = game
    rid, uids = started_room(service)
    state = service.repository.read(rid)
    docs = projections(state)
    for uid in uids:
        private = docs[f"privatePlayers/{uid}"]
        assert private["preferences"] == state["privatePlayers"][uid]["preferences"]
        dumped = json.dumps(private)
        for other in uids:
            if other != uid:
                assert other not in dumped


def test_student_and_teacher_snapshots_hide_other_students_secrets(game):
    service, _ = game
    rid, uids = started_room(service)
    state = service.repository.read(rid)
    to_phase(service, rid, "vote")
    for uid in uids:
        view = service.read(rid, uid)
        assert view["viewer"] == "student"
        assert view["me"]["isSwitcher"] == state["privatePlayers"][uid]["isSwitcher"]
        shared = {k: v for k, v in view.items() if k != "me"}
        assert not set(keys_in(shared)) & set(SECRET_KEYS)
    teacher = service.read(rid, TEACHER)
    assert teacher["viewer"] == "host" and "me" not in teacher
    assert not set(keys_in(teacher)) & set(SECRET_KEYS)


def test_teacher_never_sees_preference_choices_even_in_lobby(game):
    service, _ = game
    rid, uids = open_room(service)
    choose(service, rid, {uid: (0, 1) for uid in uids})
    teacher = service.read(rid, TEACHER)
    assert all(p["prefsDone"] for p in teacher["participants"])
    assert "preferences" not in set(keys_in(teacher))


def test_reveal_shows_switchers_and_votes_but_never_preferences(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "reveal")
    state = service.repository.read(rid)
    reveal = projections(state)["publicRounds/reveal"]
    assert reveal["switchers"]
    for path, doc in public_documents(state).items():
        assert not {"preferences", "preferenceRank", "topRoleId", "tiedRoleIds"} & set(keys_in(doc)), path


def test_event_card_is_hidden_until_event_phase(game):
    service, _ = game
    rid, uids = started_room(service)
    to_phase(service, rid, "statement")
    assert service.read(rid, uids[0])["room"]["event"] is None
    to_phase(service, rid, "event")
    assert service.read(rid, uids[0])["room"]["event"]["title"]


def test_outsiders_cannot_read_rooms(client, game):
    service, _ = game
    api, actor = client
    rid, _ = open_room(service)
    actor[0] = "stranger"
    assert api.get(f"/api/rooms/{rid}/me").status_code == 403
    assert api.post(f"/api/rooms/{rid}/sync", json={}).status_code == 403
