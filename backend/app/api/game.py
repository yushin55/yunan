from fastapi import APIRouter, Depends

from app.api.dependencies import game_service
from app.api.rooms import RoomId
from app.core.auth import current_uid
from app.models.requests import Empty, Extend, Intro, Kick, LineDelete, LineAdd, LineEdit, MicOn, Preferences, Review, Settings, Speaker, Speech, Sync, Vote
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
for name, schema in [("settings", Settings), ("intro", Intro), ("kick", Kick), ("start", Empty), ("pause", Empty), ("resume", Empty), ("next", Sync), ("skip-phase", Sync), ("speaker", Speaker), ("extend", Extend), ("end", Empty), ("review", Review), ("line-edit", LineEdit), ("line-delete", LineDelete)]:
    register(name, schema, action(name))

# Student actions.
for name, schema in [("preferences", Preferences), ("confirm-role", Empty), ("end-turn", Sync), ("mic-on", MicOn), ("mic-off", Sync), ("vote", Vote)]:
    register(name, schema, action(name))

# The discussion record. Audio is transcribed and dropped; lines are checked before anyone sees them.
register("speech", Speech, lambda service, room_id, uid, data: service.speech(room_id, uid, data))
register("line-add", LineAdd, lambda service, room_id, uid, data: service.add_line(room_id, uid, data))
register("summary", Empty, lambda service, room_id, uid, data: service.summarize(room_id, uid))
# Teacher only, after the reveal: AI drafts of each student's evaluation report.
register("student-report", Empty, lambda service, room_id, uid, data: service.student_reports(room_id, uid))
