from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import game, rooms, topics
from app.core.config import settings

app = FastAPI(title="브릿지 — 역할 추리형 토론 수업", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins), allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
app.include_router(rooms.router)
app.include_router(game.router)
app.include_router(topics.router)


@app.get("/health")
def health():
    return {"ok": True, "service": "bridge", "storage": "firestore", "version": "2.0.0", "moderation": settings.moderation_mode}
