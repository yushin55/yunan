"""One private aggregate is the transaction boundary; client documents are projections.

Firestore transactions guard the aggregate's update timestamp and atomically
publish state and all public/private projections. No game state or timer lives
in a Python process in production.
"""
import copy
import hashlib
import random
import threading
import time
from typing import Callable

from fastapi import HTTPException


def code_hash(code: str) -> str:
    return hashlib.sha256(code.upper().encode()).hexdigest()


def projections(state: dict) -> dict[str, dict]:
    docs = {"": state["room"], "internal/state": state}
    for uid, participant in state["participants"].items():
        docs[f"participants/{uid}"] = participant
        private = {k: v for k, v in state["privatePlayers"][uid].items() if k not in ("rateWindow", "rateCount", "reportCount")}
        docs[f"privatePlayers/{uid}"] = private
    for name, rows in state["rounds"].items():
        docs[f"publicRounds/{name}"] = {"items": rows}
    for uid, result in state.get("results", {}).items():
        docs[f"results/{uid}"] = result
    return docs


class FirestoreRoomRepository:
    def __init__(self, db):
        self.db = db

    def read(self, room_id: str) -> dict:
        doc = self.db.document(f"rooms/{room_id}/internal/state").get()
        if not doc.exists:
            raise HTTPException(404, "방을 찾을 수 없어요.")
        return doc.to_dict()

    def resolve(self, code: str) -> str:
        doc = self.db.document(f"roomCodes/{code_hash(code)}").get()
        if not doc.exists:
            raise HTTPException(404, "초대 코드를 다시 확인해 주세요.")
        return doc.to_dict()["roomId"]

    def create(self, state: dict, uid: str, now: int) -> dict:
        from google.cloud import firestore
        room = state["room"]
        code_ref = self.db.document(f"roomCodes/{code_hash(room['code'])}")
        limit_ref = self.db.document(f"userLimits/{uid}")

        @firestore.transactional
        def operation(transaction):
            existing = code_ref.get(transaction=transaction)
            limits = limit_ref.get(transaction=transaction)
            if existing.exists:
                raise HTTPException(409, "방 코드가 겹쳤어요. 다시 시도해 주세요.")
            value = limits.to_dict() if limits.exists else {}
            count = value.get("count", 0) if now - value.get("window", 0) < 3_600_000 else 0
            if count >= 12:
                raise HTTPException(429, "한 시간에 만들 수 있는 방 수를 초과했어요.")
            transaction.set(limit_ref, {"window": value.get("window", now) if count else now, "count": count + 1})
            transaction.set(code_ref, {"roomId": room["roomId"]})
            self._write(transaction, state)
            return state

        return self._execute(operation)

    def mutate(self, room_id: str, update: Callable[[dict], None]) -> dict:
        from google.cloud import firestore
        state_ref = self.db.document(f"rooms/{room_id}/internal/state")

        @firestore.transactional
        def operation(transaction):
            # Read without a pessimistic lock, then atomically guard the entire
            # write set with the aggregate's update timestamp. This avoids lock
            # upgrades when four players submit while room listeners refresh.
            doc = state_ref.get()
            if not doc.exists:
                raise HTTPException(404, "방을 찾을 수 없어요.")
            state = doc.to_dict()
            before = copy.deepcopy(state)
            update(state)
            if state != before:
                self._write(transaction, state, before, doc.update_time)
            return state

        return self._execute(operation)

    def _execute(self, operation):
        from google.api_core.exceptions import Aborted, FailedPrecondition, DeadlineExceeded, ServiceUnavailable
        # A competing commit invalidates the aggregate timestamp precondition.
        # Re-read and recompute within a fresh transaction, with bounded jitter.
        for attempt in range(8):
            try:
                # Let this one bounded loop own backoff rather than nesting the
                # SDK's five immediate retries inside another retry loop.
                return operation(self.db.transaction(max_attempts=1))
            except (Aborted, FailedPrecondition, ValueError) as exc:
                if not isinstance(exc, (Aborted, FailedPrecondition)) and not isinstance(exc.__cause__, Aborted):
                    raise
                if attempt == 7:
                    raise HTTPException(503, "동시 요청이 겹쳤어요. 잠시 후 다시 연결해 주세요.", headers={"Retry-After": "2"}) from exc
                time.sleep(random.uniform(0.05, 0.15) * min(4, 2 ** attempt))
            except (DeadlineExceeded, ServiceUnavailable) as exc:
                raise HTTPException(503, "서버가 동시 요청을 처리 중이에요. 잠시 후 다시 연결해 주세요.", headers={"Retry-After": "2"}) from exc

    def _write(self, transaction, state, before=None, update_time=None):
        root = f"rooms/{state['room']['roomId']}"
        previous = projections(before) if before else {}
        for suffix, document in projections(state).items():
            if suffix not in previous or previous[suffix] != document:
                ref = self.db.document(root + (f"/{suffix}" if suffix else ""))
                if suffix == "internal/state" and update_time is not None:
                    transaction.update(ref, document, option=self.db.write_option(last_update_time=update_time))
                else:
                    transaction.set(ref, document)


class MemoryRoomRepository:
    """Unit-test dependency only. Never selected by application configuration."""
    def __init__(self):
        self.states = {}
        self.codes = {}
        self.lock = threading.RLock()

    def read(self, room_id):
        with self.lock:
            if room_id not in self.states:
                raise HTTPException(404, "방을 찾을 수 없어요.")
            return copy.deepcopy(self.states[room_id])

    def resolve(self, code):
        if code.upper() not in self.codes:
            raise HTTPException(404, "초대 코드를 다시 확인해 주세요.")
        return self.codes[code.upper()]

    def create(self, state, uid, now):
        with self.lock:
            room = state["room"]
            if room["code"] in self.codes:
                raise HTTPException(409, "Duplicate code")
            self.states[room["roomId"]] = copy.deepcopy(state)
            self.codes[room["code"]] = room["roomId"]
            return copy.deepcopy(state)

    def mutate(self, room_id, update):
        with self.lock:
            state = self.read(room_id)
            update(state)
            self.states[room_id] = copy.deepcopy(state)
            return copy.deepcopy(state)
