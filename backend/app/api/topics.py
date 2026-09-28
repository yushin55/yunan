from fastapi import APIRouter

from app.repositories.topics import load_topics

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("/count")
def count():
    return {"count": sum(t["active"] for t in load_topics())}
