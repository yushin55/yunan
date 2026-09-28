"""Real Auth tokens + real Firestore transactions; run with RUN_EMULATOR_TESTS=1.

The clock is injected solely to avoid waiting ten minutes in tests. Authentication,
API validation, role assignment, persistence and transactions are unmodified.
"""
import os
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import game_service
from app.core.firebase import firestore_client
from app.main import app
from app.repositories.rooms import FirestoreRoomRepository
from app.services.game import GameService
from app.services.phase_engine import now_ms

pytestmark = [pytest.mark.emulator, pytest.mark.skipif(os.getenv("RUN_EMULATOR_TESTS") != "1", reason="Firebase emulators are opt-in")]


def test_four_authenticated_accounts_complete_game_in_firestore():
    clock = [now_ms()]
    repository = FirestoreRoomRepository(firestore_client())
    service = GameService(repository, lambda: clock[0])
    app.dependency_overrides[game_service] = lambda: service
    tokens = []
    uids = []
    for _ in range(4):
        auth = httpx.post("http://" + os.environ["FIREBASE_AUTH_EMULATOR_HOST"] + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key", json={"returnSecureToken": True})
        assert auth.status_code == 200, auth.text
        tokens.append(auth.json()["idToken"])
        uids.append(auth.json()["localId"])
    try:
        with TestClient(app) as api:
            def post(index, action, payload):
                result = api.post(action, json=payload, headers={"Authorization": "Bearer " + tokens[index]})
                assert result.status_code == 200, (action, result.text)
                return result.json()

            created = post(0, "/api/rooms", {"nickname": "통합테스트0"})
            rid = created["room"]["roomId"]
            base = f"/api/rooms/{rid}/"

            def concurrent(action, payload):
                # Every real participant may press submit at the same instant.
                with ThreadPoolExecutor(max_workers=4) as executor:
                    list(executor.map(lambda i: post(i, base + action, payload(i)), range(4)))
                return service.read(rid, uids[0])

            for i in range(1, 4):
                post(i, "/api/rooms/join", {"nickname": f"통합테스트{i}", "code": created["room"]["code"]})
                post(i, base + "ready", {"ready": True})
            current = post(0, base + "start", {})
            topic = current["room"]["topic"]
            assert "topic" not in created["room"]
            clock[0] = current["room"]["phaseEndsAt"] + 1
            # Race four independent authenticated requests against one expired version.
            with ThreadPoolExecutor(max_workers=4) as executor:
                synced = list(executor.map(lambda i: post(i, base + "sync", {"phaseVersion": 1}), range(4)))
            assert {r["room"]["phaseVersion"] for r in synced} == {2}
            assert {r["room"]["revision"] for r in synced} == {current["room"]["revision"] + 1}
            stale = post(0, base + "sync", {"phaseVersion": 1})
            assert stale["room"]["revision"] == synced[0]["room"]["revision"]
            assert repository.db.document(f"rooms/{rid}").get().to_dict()["phaseVersion"] == 2
            preferences = [r["id"] for r in topic["roles"][:2]]
            current = concurrent("initial-position", lambda i: {"position": "support", "reason": f"비공개 생각 {i}", "preferences": preferences})
            clock[0] = current["room"]["phaseEndsAt"] + 1
            post(0, base + "sync", {"phaseVersion": current["room"]["phaseVersion"]})
            cards = []
            for i in range(4):
                mine = api.get(base + "me", headers={"Authorization": "Bearer " + tokens[i]}).json()
                assert mine["room"]["topicId"] == topic["topicId"]
                assert f"비공개 생각 {(i+1)%4}" not in str(mine)
                cards.append(mine["me"]["cards"][0]["id"])
            concurrent("claim", lambda i: {"text": "제 역할에서는 공정한 절차가 중요합니다.", "cardId": cards[i], "cardConnection": "개인의 설명을 들을 기회를 보장하는 방안과 연결됩니다."})
            concurrent("review-done", lambda i: {})
            concurrent("scenario", lambda i: {"optionId": topic["scenario"]["options"][0]["id"], "reason": "현장 적용 가능성을 고려했어요."})
            concurrent("review-done", lambda i: {})
            concurrent("question", lambda i: {"targetUid": uids[(i+1)%4], "text": "그 기준을 어떻게 적용할 건가요?"})
            concurrent("answer", lambda i: {"questionId": "q_" + uids[(i-1)%4], "text": "명확한 기준과 재검토 절차를 마련하겠습니다."})
            current = concurrent("guess", lambda i: {"targetUid": uids[(i+1)%4], "reason": "우선 가치", "clue": "판단 기준에 변화가 있었어요."})
            assert sum(r["isSwitcher"] for r in current["rounds"]["reveal"]) == 2
            concurrent("rating", lambda i: {"targetUid": uids[(i+1)%4], "accuracy": 5, "respect": 5, "evidence": 4})
            current = concurrent("reflection", lambda i: {"position": "support", "understood": "관점마다 우선 가치가 달라요", "disagree": "권한 확대는 여전히 신중해야 해요", "opinion": f"최종 비공개 의견 {i}", "share": i == 1})
            assert current["room"]["phase"] == "results"
            assert len(current["results"]["players"]) == 4
            persisted = GameService(FirestoreRoomRepository(firestore_client())).read(rid, uids[0])
            assert persisted["room"]["topicId"] == topic["topicId"]
            assert "최종 비공개 의견 1" in str(persisted)
            assert "최종 비공개 의견 2" not in str(persisted)
            assert "비공개 생각 1" not in str(persisted)
            assert repository.db.document(f"rooms/{rid}").get().to_dict()["phase"] == "results"
    finally:
        app.dependency_overrides.clear()
