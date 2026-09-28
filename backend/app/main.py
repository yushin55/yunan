from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import game, rooms, topics
from app.core.config import settings

app = FastAPI(title="유난 — 반대편의 변호인", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins), allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
app.include_router(rooms.router)
app.include_router(game.router)
app.include_router(topics.router)


@app.get("/health")
def health():
    return {"ok": True, "service": "yunan", "storage": "firestore", "version": "1.0.0"}
