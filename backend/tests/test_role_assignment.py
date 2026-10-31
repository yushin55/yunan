import random
from collections import Counter

import pytest
from fastapi import HTTPException

from app.services.role_assignment import AssignmentError, assign_roles
from conftest import TEACHER, choose, open_room

ROLES = ["student_rep", "parent", "teacher", "counselor", "it_teacher"]


def spec_example():
    # Three of six students pick "student_rep" first; one of them must become the switcher.
    return {
        "a": ("student_rep", "parent"), "b": ("student_rep", "teacher"), "c": ("student_rep", "counselor"),
        "d": ("parent", "teacher"), "e": ("teacher", "it_teacher"), "f": ("counselor", "parent"),
    }


def test_switcher_comes_from_students_with_most_chosen_first_preference():
    for seed in range(200):
        result = assign_roles(ROLES, spec_example(), 1, random.Random(seed))
        switchers = [uid for uid, a in result["assignments"].items() if a["isSwitcher"]]
        assert result["topRoleId"] == "student_rep"
        assert len(switchers) == 1 and switchers[0] in {"a", "b", "c"}


def test_switcher_gets_role_outside_both_preferences_and_others_get_one_of_theirs():
    rng = random.Random(1)
    for seed in range(300):
        prefs = {}
        for i in range(rng.randint(6, 8)):
            first, second = rng.sample(ROLES, 2)
            prefs[f"u{i}"] = (first, second)
        k = 1 if seed % 2 else 2
        try:
            result = assign_roles(ROLES, prefs, k, random.Random(seed))
        except AssignmentError as exc:
            assert exc.code == "not_enough_candidates" and k == 2
            continue
        assert sum(a["isSwitcher"] for a in result["assignments"].values()) == k
        for uid, assigned in result["assignments"].items():
            if assigned["isSwitcher"]:
                assert prefs[uid][0] == result["topRoleId"]
                assert assigned["roleId"] not in prefs[uid]
                assert assigned["roleId"] in ROLES
            else:
                assert assigned["roleId"] in prefs[uid]
                assert assigned["preferenceRank"] == prefs[uid].index(assigned["roleId"]) + 1


def test_example_second_preference_is_also_excluded_for_switcher():
    # The spec example: a switcher who picked student_rep then parent receives neither.
    prefs = spec_example()
    seen = set()
    for seed in range(300):
        result = assign_roles(ROLES, prefs, 1, random.Random(seed))
        uid = next(u for u, a in result["assignments"].items() if a["isSwitcher"])
        assert result["assignments"][uid]["roleId"] not in prefs[uid]
        seen.add(uid)
    assert seen == {"a", "b", "c"}  # Every candidate can be drawn.


def test_tied_most_chosen_roles_are_resolved_randomly_among_tied_roles():
    prefs = {"a": ("parent", "teacher"), "b": ("parent", "counselor"), "c": ("teacher", "parent"),
             "d": ("teacher", "counselor"), "e": ("counselor", "parent"), "f": ("it_teacher", "parent")}
    tops = Counter()
    for seed in range(200):
        result = assign_roles(ROLES, prefs, 1, random.Random(seed))
        assert result["tiedRoleIds"] == ["parent", "teacher"]
        assert result["topRoleId"] in ("parent", "teacher")
        switcher = next(u for u, a in result["assignments"].items() if a["isSwitcher"])
        assert prefs[switcher][0] == result["topRoleId"]
        tops[result["topRoleId"]] += 1
    assert tops["parent"] > 20 and tops["teacher"] > 20


def test_two_switchers_need_two_candidates():
    prefs = {"a": ("parent", "teacher"), "b": ("teacher", "parent"), "c": ("counselor", "parent"), "d": ("it_teacher", "parent")}
    with pytest.raises(AssignmentError) as error:
        assign_roles(ROLES, prefs, 2, random.Random(0))
    assert error.value.code == "not_enough_candidates"
    assert "1명으로" in error.value.message
    assert assign_roles(ROLES, prefs, 1, random.Random(0))  # One switcher still works.


def test_two_switchers_both_from_top_role():
    prefs = spec_example()
    for seed in range(100):
        result = assign_roles(ROLES, prefs, 2, random.Random(seed))
        switchers = {u for u, a in result["assignments"].items() if a["isSwitcher"]}
        assert len(switchers) == 2 and switchers <= {"a", "b", "c"}


def test_rejects_topics_with_fewer_than_four_roles_and_bad_preferences():
    with pytest.raises(AssignmentError) as error:
        assign_roles(ROLES[:3], {"a": ("student_rep", "parent")}, 1)
    assert error.value.code == "too_few_roles"
    with pytest.raises(AssignmentError) as error:
        assign_roles(ROLES, {"a": ("student_rep", "unknown")}, 1)
    assert error.value.code == "invalid_preferences"


def test_service_blocks_start_and_explains_when_candidates_are_short(game, monkeypatch):
    service, _ = game
    rid, uids = open_room(service, switchers=2)
    choose(service, rid, {uid: (0, 1) for uid in uids})

    def short(*args, **kwargs):
        raise AssignmentError("not_enough_candidates", "역할 전환자 수를 1명으로 바꿔 주세요.")

    monkeypatch.setattr("app.services.game.assign_roles", short)
    with pytest.raises(HTTPException) as error:
        service.action(rid, TEACHER, "start", {})
    assert error.value.status_code == 409 and "1명으로" in error.value.detail
    state = service.repository.read(rid)
    assert state["room"]["phase"] == "lobby"
    assert all(p["roleId"] is None for p in state["privatePlayers"].values())


def test_service_switcher_shortfall_with_real_algorithm(game):
    service, _ = game
    rid, uids = open_room(service, count=6, switchers=2)
    # With six students and five roles a shortfall cannot happen, so this room allows four.
    state = service.repository.read(rid)
    state["room"]["minStudents"] = 4
    service.repository.states[rid] = state
    for uid in uids[4:]:
        service.action(rid, TEACHER, "kick", {"targetUid": uid})
    # Four students, four different first preferences → only one candidate for two switchers.
    choose(service, rid, {uids[0]: (0, 1), uids[1]: (1, 2), uids[2]: (2, 3), uids[3]: (3, 0)})
    with pytest.raises(HTTPException) as error:
        service.action(rid, TEACHER, "start", {})
    assert error.value.status_code == 409 and "1명으로" in error.value.detail
    service.action(rid, TEACHER, "settings", {"switcherCount": 1})
    assert service.action(rid, TEACHER, "start", {})["room"]["phase"] == "role"
