from fastapi import APIRouter, Depends

from app.api.dependencies import game_service
from app.api.rooms import RoomId
from app.core.auth import current_uid
from app.models.requests import Answer, Claim, Guess, InitialPosition, Question, Rating, React, Reflection, Report, ReviewDone, Scenario
from app.services.game import GameService

router = APIRouter(prefix="/api/rooms", tags=["game"])


def register_action(action, model):
    # Each endpoint has its concrete Pydantic request type in the generated schema.
    def endpoint(room_id: RoomId, data, uid: str = Depends(current_uid), service: GameService = Depends(game_service)):
        return service.action(room_id, uid, action, data.model_dump())
    endpoint.__annotations__["data"] = model
    endpoint.__name__ = action.replace("-", "_")
    router.add_api_route("/{room_id}/" + action, endpoint, methods=["POST"])


for name, schema in [("initial-position", InitialPosition), ("claim", Claim), ("scenario", Scenario), ("question", Question), ("answer", Answer), ("guess", Guess), ("rating", Rating), ("reflection", Reflection), ("report", Report), ("react", React), ("review-done", ReviewDone)]:
    register_action(name, schema)
