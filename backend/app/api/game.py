from fastapi import APIRouter, Depends

from app.api.dependencies import game_service
from app.api.rooms import RoomId
from app.core.auth import current_uid
from app.models.requests import Empty, Extend, Kick, Message, Preferences, Review, Settings, Statement, Sync, Vote
from app.services.game import GameService

router = APIRouter(prefix="/api/rooms", tags=["game"])


def register(path, model, handler):
    # Each endpoint keeps its concrete Pydantic request type in the generated schema.
    def endpoint(room_id: RoomId, data, uid: str = Depends(current_uid), service: GameService = Depends(game_service)):
        return handler(service, room_id, uid, data.model_dump(exclude_none=path == "settings"))
    endpoint.__annotations__["data"] = model
    endpoint.__name__ = path.replace("-", "_")
    router.add_api_route("/{room_id}/" + path, endpoint, methods=["POST"])


def action(name):
    return lambda service, room_id, uid, data: service.action(room_id, uid, name, data)


# Teacher (room creator) controls. The service rejects everyone else with 403.
for name, schema in [("settings", Settings), ("kick", Kick), ("start", Empty), ("pause", Empty), ("resume", Empty), ("next", Sync), ("extend", Extend), ("end", Empty), ("review", Review)]:
    register(name, schema, action(name))

# Student actions.
for name, schema in [("preferences", Preferences), ("confirm-role", Empty), ("vote", Vote)]:
    register(name, schema, action(name))

# Public text is checked for profanity and personal attacks before anyone else sees it.
register("statement", Statement, lambda service, room_id, uid, data: service.post_text(room_id, uid, "statement", data))
register("messages", Message, lambda service, room_id, uid, data: service.post_text(room_id, uid, data["kind"], data))
