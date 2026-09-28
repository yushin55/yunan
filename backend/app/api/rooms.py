from typing import Annotated

from fastapi import APIRouter, Depends, Path

from app.api.dependencies import game_service
from app.core.auth import current_uid
from app.models.requests import CreateRoom, JoinRoom, Ready, Sync
from app.services.game import GameService

router = APIRouter(prefix="/api/rooms", tags=["rooms"])
RoomId = Annotated[str, Path(pattern=r"^[a-f0-9]{32}$")]


@router.post("")
def create(data: CreateRoom, uid: str = Depends(current_uid), service: GameService = Depends(game_service)):
    return service.create(uid, data.model_dump())


@router.post("/join")
def join(data: JoinRoom, uid: str = Depends(current_uid), service: GameService = Depends(game_service)):
    return service.join(uid, data.model_dump())


@router.get("/{room_id}/me")
def me(room_id: RoomId, uid: str = Depends(current_uid), service: GameService = Depends(game_service)):
    return service.read(room_id, uid)


@router.post("/{room_id}/ready")
def ready(room_id: RoomId, data: Ready, uid: str = Depends(current_uid), service: GameService = Depends(game_service)):
    return service.action(room_id, uid, "ready", data.model_dump())


@router.post("/{room_id}/start")
def start(room_id: RoomId, uid: str = Depends(current_uid), service: GameService = Depends(game_service)):
    return service.action(room_id, uid, "start", {})


@router.post("/{room_id}/sync")
def sync(room_id: RoomId, data: Sync = Sync(), uid: str = Depends(current_uid), service: GameService = Depends(game_service)):
    return service.action(room_id, uid, "sync", data.model_dump())
