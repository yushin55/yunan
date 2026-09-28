import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import game_service
from app.core.auth import current_uid
from app.main import app
from app.repositories.rooms import MemoryRoomRepository
from app.services.game import GameService


@pytest.fixture
def game():
    clock = [1_800_000_000_000]
    repository = MemoryRoomRepository()
    return GameService(repository, lambda: clock[0]), clock


@pytest.fixture
def client(game):
    service, _ = game
    actor = ["u0"]
    app.dependency_overrides[game_service] = lambda: service
    app.dependency_overrides[current_uid] = lambda: actor[0]
    with TestClient(app) as instance:
        yield instance, actor
    app.dependency_overrides.clear()


def four_players(service):
    response = service.create("u0", {"nickname": "참가자0"})
    rid = response["room"]["roomId"]
    code = response["room"]["code"]
    for i in range(1, 4):
        service.join(f"u{i}", {"nickname": f"참가자{i}", "code": code})
        service.action(rid, f"u{i}", "ready", {"ready": True})
    return rid


def expire(service, clock, rid):
    state = service.repository.read(rid)
    clock[0] = state["room"]["phaseEndsAt"] + 1
    return service.action(rid, "u0", "sync", {"phaseVersion": state["room"]["phaseVersion"]})


def start_and_assign(service, clock, rid):
    service.action(rid, "u0", "start", {})
    current = expire(service, clock, rid)
    preferences = [r["id"] for r in current["room"]["topic"]["roles"][:2]]
    for i in range(4):
        service.action(rid, f"u{i}", "initial-position", {"position": "support", "reason": f"나만의 실제 의견 {i}", "preferences": preferences})
    return expire(service, clock, rid)
