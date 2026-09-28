from app.core.firebase import firestore_client
from app.repositories.rooms import FirestoreRoomRepository
from app.services.game import GameService


def game_service():
    return GameService(FirestoreRoomRepository(firestore_client()))
