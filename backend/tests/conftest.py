import random

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import game_service
from app.core.auth import current_uid
from app.main import app
from app.repositories.rooms import MemoryRoomRepository
from app.services.game import GameService
from app.services.moderation import Moderator

TEACHER = "teacher"
STUDENTS = [f"s{i}" for i in range(8)]


@pytest.fixture
def game():
    clock = [1_800_000_000_000]
    service = GameService(MemoryRoomRepository(), lambda: clock[0], moderator=Moderator(mode="rules"), rng=random.Random(7))
    return service, clock


@pytest.fixture
def client(game):
    service, _ = game
    actor = [TEACHER]
    app.dependency_overrides[game_service] = lambda: service
    app.dependency_overrides[current_uid] = lambda: actor[0]
    with TestClient(app) as instance:
        yield instance, actor
    app.dependency_overrides.clear()


def role_ids(service, rid):
    return [r["id"] for r in service.repository.read(rid)["room"]["topic"]["roles"]]


def open_room(service, count=6, topic="smartphone_class", switchers=1):
    created = service.create(TEACHER, {"topicId": topic, "switcherCount": switchers})
    rid, code = created["room"]["roomId"], created["room"]["code"]
    for i in range(count):
        service.join(STUDENTS[i], {"nickname": f"학생{i}", "code": code})
    return rid, STUDENTS[:count]


def choose(service, rid, prefs: dict[str, tuple[int, int]]):
    roles = role_ids(service, rid)
    for uid, (first, second) in prefs.items():
        service.action(rid, uid, "preferences", {"first": roles[first], "second": roles[second]})


def started_room(service, count=6, switchers=1, prefs=None):
    rid, uids = open_room(service, count, switchers=switchers)
    prefs = prefs or {uid: ((0, 1) if i < 3 else (i % 5, (i + 1) % 5)) for i, uid in enumerate(uids)}
    choose(service, rid, prefs)
    service.action(rid, TEACHER, "start", {})
    return rid, uids


def expire(service, clock, rid):
    state = service.repository.read(rid)
    clock[0] = state["room"]["phaseEndsAt"] + 1
    return service.action(rid, TEACHER, "sync", {"phaseVersion": state["room"]["phaseVersion"]})


def to_phase(service, rid, phase):
    while service.repository.read(rid)["room"]["phase"] != phase:
        service.action(rid, TEACHER, "next", {})
