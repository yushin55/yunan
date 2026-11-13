"""Real Auth tokens + real Firestore transactions; run with RUN_EMULATOR_TESTS=1.

One teacher and six students play a whole game through the HTTP API. Concurrent
submissions race on the same aggregate. Moderation is fixed to rules and transcription to a
stand-in so the test never calls an external AI service.
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


def teacher_sign_in():
    """A Google account in the Auth emulator, which accepts an unsigned JSON ID token."""
    import json

    id_token = json.dumps({"sub": "integration-teacher", "email": "teacher@example.com", "email_verified": True})
    auth = httpx.post(
        "http://" + os.environ["FIREBASE_AUTH_EMULATOR_HOST"] + "/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-key",
        json={"postBody": f"id_token={id_token}&providerId=google.com", "requestUri": "http://localhost", "returnSecureToken": True},
    )
    assert auth.status_code == 200, auth.text
    return auth.json()["idToken"], auth.json()["localId"]


def test_teacher_and_six_students_complete_a_game_in_firestore():
    db = firestore_client()
    service = GameService(FirestoreRoomRepository(db), moderator=Moderator(mode="rules"), rng=random.SystemRandom(), transcriber=lambda audio, mime: "제 역할의 입장을 말합니다.")
    app.dependency_overrides[game_service] = lambda: service
    teacher_token, teacher_uid = teacher_sign_in()
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

            # Students are anonymous and may not open a room.
            post(students[0][0], "/api/rooms", {"topicId": "school_cctv"}, status=403)
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
            view = post(teacher_token, base + "sync", {})
            assert view["room"]["phase"] == "statement"
            for i in range(6):
                version = view["room"]["phaseVersion"]
                assert view["room"]["turn"]["uid"] == students[i][1]
                # Everyone presses at once; only the student whose turn it is gets the microphone.
                with ThreadPoolExecutor(max_workers=2) as executor:
                    answers = list(executor.map(lambda token: api.post(base + "mic-on", json={"kind": "statement"}, headers={"Authorization": "Bearer " + token}).status_code, [students[i][0], students[(i + 1) % 6][0]]))
                assert answers == [200, 409]
                post(students[i][0], base + "speech", {"audio": "QUJD", "mimeType": "audio/wav", "phaseVersion": version})
                # The speaker and the teacher finish the same turn at once; only one step happens.
                with ThreadPoolExecutor(max_workers=2) as executor:
                    list(executor.map(lambda token: post(token, base + ("end-turn" if token != teacher_token else "next"), {"phaseVersion": version}), [students[i][0], teacher_token]))
                view = post(teacher_token, base + "sync", {})
                assert view["room"]["phaseVersion"] == version + 1
            assert view["room"]["phase"] == "event" and view["room"]["event"]["title"]
            # The open floor: two students race for the one microphone inside a real transaction.
            with ThreadPoolExecutor(max_workers=6) as executor:
                answers = list(executor.map(lambda token: api.post(base + "mic-on", json={"kind": "question"}, headers={"Authorization": "Bearer " + token}).status_code, [token for token, _ in students]))
            assert sorted(answers) == [200, 409, 409, 409, 409, 409]
            flagged = post(teacher_token, base + "line-add", {"text": "닥쳐"})
            assert flagged["speech"] == "held"
            assert room_ref.collection("publicRounds").document("transcript").get().to_dict()["items"][0]["uid"] == students[0][1]
            post(teacher_token, base + "skip-phase", {})
            post(teacher_token, base + "skip-phase", {})
            secrets = {uid: service.read(rid, uid)["me"]["isSwitcher"] for _, uid in students}
            switcher = next(uid for uid, flag in secrets.items() if flag)
            everyone(base + "vote", lambda i: {"targets": [switcher if students[i][1] != switcher else students[(i + 1) % 6][1]]})
            final = post(teacher_token, base + "sync", {})
            assert final["room"]["phase"] == "reveal"
            assert final["rounds"]["reveal"]["switchers"][0]["uid"] == switcher
            assert len(final["rounds"]["transcript"]) == 6  # The flagged line never became public.
            post(teacher_token, base + "end", {})
            assert room_ref.get().to_dict()["phase"] == "ended"
            # Reconnecting student gets the same role after the game.
            again = post(students[1][0], "/api/rooms/join", {"nickname": "다시", "code": code})
            assert again["me"]["roleId"] == service.read(rid, students[1][1])["me"]["roleId"]
    finally:
        app.dependency_overrides.clear()
