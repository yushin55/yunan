"""Real Auth tokens + real Firestore transactions; run with RUN_EMULATOR_TESTS=1.

One teacher and six students play a whole game through the HTTP API. Concurrent
submissions race on the same aggregate. Only the moderation mode is fixed to rules so
the test never calls an external AI service.
"""
import os
import random
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import game_service
from app.core.firebase import firestore_client
from app.main import app
from app.repositories.rooms import FirestoreRoomRepository
from app.services.game import GameService
from app.services.moderation import Moderator

pytestmark = [pytest.mark.emulator, pytest.mark.skipif(os.getenv("RUN_EMULATOR_TESTS") != "1", reason="Firebase emulators are opt-in")]


def sign_up():
    auth = httpx.post("http://" + os.environ["FIREBASE_AUTH_EMULATOR_HOST"] + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key", json={"returnSecureToken": True})
    assert auth.status_code == 200, auth.text
    return auth.json()["idToken"], auth.json()["localId"]


def test_teacher_and_six_students_complete_a_game_in_firestore():
    db = firestore_client()
    service = GameService(FirestoreRoomRepository(db), moderator=Moderator(mode="rules"), rng=random.SystemRandom())
    app.dependency_overrides[game_service] = lambda: service
    teacher_token, teacher_uid = sign_up()
    students = [sign_up() for _ in range(6)]
    try:
        with TestClient(app) as api:
            def post(token, path, payload, status=200):
                result = api.post(path, json=payload, headers={"Authorization": "Bearer " + token})
                assert result.status_code == status, (path, result.text)
                return result.json()

            def everyone(path, payload):
                with ThreadPoolExecutor(max_workers=6) as executor:
                    return list(executor.map(lambda i: post(students[i][0], path, payload(i)), range(6)))

            created = post(teacher_token, "/api/rooms", {"topicId": "school_cctv"})
            rid, code = created["room"]["roomId"], created["room"]["code"]
            base = f"/api/rooms/{rid}/"
            assert created["viewer"] == "host"
            for i, (token, _) in enumerate(students):
                post(token, "/api/rooms/join", {"nickname": f"통합{i}", "code": code})
            roles = [r["id"] for r in created["room"]["topic"]["roles"]]
            everyone(base + "preferences", lambda i: {"first": roles[0] if i < 3 else roles[i - 2], "second": roles[4]})
            post(students[0][0], base + "start", {}, status=403)
            started = post(teacher_token, base + "start", {})
            assert started["room"]["phase"] == "role"

            # Firestore projections: no secrets in shared documents.
            room_ref = db.document(f"rooms/{rid}")
            for snap in room_ref.collection("participants").stream():
                assert "preferences" not in snap.to_dict() and "isSwitcher" not in snap.to_dict()
            assert "preferences" not in str(room_ref.collection("host").document("state").get().to_dict())

            everyone(base + "confirm-role", lambda i: {})
            everyone(base + "statement", lambda i: {"text": f"제 역할로서 {i}번 입장을 발표합니다."})
            view = post(teacher_token, base + "sync", {})
            assert view["room"]["phase"] == "event" and view["room"]["event"]["title"]
            assert len(view["rounds"]["statements"]) == 6
            everyone(base + "messages", lambda i: {"kind": "question", "text": f"{i}번의 질문이에요", "targetUid": students[(i + 1) % 6][1]})
            flagged = post(students[0][0], base + "messages", {"kind": "answer", "text": "닥쳐"})
            assert flagged["moderation"]["status"] == "needs_edit"
            post(teacher_token, base + "next", {})
            post(teacher_token, base + "next", {})
            secrets = {uid: service.read(rid, uid)["me"]["isSwitcher"] for _, uid in students}
            switcher = next(uid for uid, flag in secrets.items() if flag)
            everyone(base + "vote", lambda i: {"targets": [switcher if students[i][1] != switcher else students[(i + 1) % 6][1]]})
            final = post(teacher_token, base + "sync", {})
            assert final["room"]["phase"] == "reveal"
            assert final["rounds"]["reveal"]["switchers"][0]["uid"] == switcher
            assert len(final["rounds"]["chat"]) == 6  # The flagged message never became public.
            post(teacher_token, base + "end", {})
            assert room_ref.get().to_dict()["phase"] == "ended"
            # Reconnecting student gets the same role after the game.
            again = post(students[1][0], "/api/rooms/join", {"nickname": "다시", "code": code})
            assert again["me"]["roleId"] == service.read(rid, students[1][1])["me"]["roleId"]
    finally:
        app.dependency_overrides.clear()
