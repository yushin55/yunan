"""Vercel build hook: validate packaged content and the ASGI entrypoint."""
from app.main import app
from app.repositories.topics import load_topics

if __name__ == "__main__":
    topics = load_topics()
    paths = app.openapi()["paths"]
    assert paths["/api/rooms/{room_id}/claim"]["post"]
    print(f"Build validated: {len(topics)} topic packs, {len(paths)} FastAPI API paths")
