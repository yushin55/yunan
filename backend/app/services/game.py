import copy
import secrets
import uuid

from fastapi import HTTPException

from app.core.config import settings
from app.repositories.topics import load_topics
from app.services.moderation import check_rate, validate_text_fields
from app.services.phase_engine import PHASE_SECONDS, REVIEW_PHASES, advance_if_needed, now_ms, require_member, snapshot
from app.services.topic_picker import pick_topic


ACTION_PHASE = {"initial-position": "initial", "claim": "claim", "scenario": "scenario", "question": "question", "answer": "question", "guess": "guess", "rating": "reveal", "reflection": "reflection"}


def player(uid, nickname, now, ready=False):
    return {"uid": uid, "nickname": nickname, "ready": ready, "submitted": [], "connectedAt": now, "joinedAt": now}


class GameService:
    def __init__(self, repository, clock=now_ms):
        self.repository = repository
        self.clock = clock

    def create(self, uid, data):
        validate_text_fields(data)
        forced = data.get("topicId")
        if forced and not settings.development:
            raise HTTPException(403, "주제 지정은 Emulator 개발 환경에서만 가능해요.")
        if forced and forced not in {t["topicId"] for t in load_topics()}:
            raise HTTPException(422, "알 수 없는 주제예요.")
        now = self.clock()
        room_id = uuid.uuid4().hex
        state = {
            "room": {"roomId": room_id, "code": "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6)), "hostUid": uid,
                     "phase": "lobby", "phaseVersion": 0, "phaseEndsAt": None, "revision": 0, "participantCount": 1, "createdAt": now, "updatedAt": now},
            "participants": {uid: player(uid, data["nickname"], now, True)}, "privatePlayers": {uid: {}},
            "submissions": {"claim": {}, "scenario": {}, "question": {}}, "guesses": {}, "ratings": {},
            "rounds": {"claim": [], "scenario": [], "question": [], "reactions": []}, "reports": [], "results": {},
            "previousTopicId": data.get("previousTopicId"), "forcedTopicId": forced,
        }
        return snapshot(self.repository.create(state, uid, now), uid)

    def join(self, uid, data):
        validate_text_fields(data)
        room_id = self.repository.resolve(data["code"])
        now = self.clock()

        def update(state):
            state["room"]["revision"] = state["room"].get("revision", 0) + 1
            state["room"]["updatedAt"] = now
            if uid in state["participants"]:
                state["participants"][uid]["connectedAt"] = now
                return
            if state["room"]["phase"] != "lobby":
                raise HTTPException(409, "이미 시작한 방이에요. 기존 참가자만 재접속할 수 있어요.")
            if len(state["participants"]) >= 6:
                raise HTTPException(409, "방이 가득 찼어요. 최대 6명이 함께할 수 있어요.")
            if any(p["nickname"] == data["nickname"] for p in state["participants"].values()):
                raise HTTPException(409, "같은 닉네임이 있어요. 다른 닉네임을 골라 주세요.")
            state["participants"][uid] = player(uid, data["nickname"], now)
            state["privatePlayers"][uid] = {}
            state["room"]["participantCount"] = len(state["participants"])
            state["room"]["updatedAt"] = now
        return snapshot(self.repository.mutate(room_id, update), uid)

    def read(self, room_id, uid):
        return snapshot(self.repository.read(room_id), uid)

    def action(self, room_id, uid, action, data):
        validate_text_fields(data)
        deferred_error = []

        def update(state):
            deferred_error.clear()  # Firestore may retry this transaction callback.
            now = self.clock()
            require_member(state, uid)
            room = state["room"]
            private = state["privatePlayers"][uid]
            if action == "sync" and data.get("phaseVersion") is not None and data["phaseVersion"] != room["phaseVersion"]:
                # A second client syncing an already-completed phase is read-only.
                # Avoid making every waiting client contend to rewrite the room.
                return
            check_rate(private, now)
            # Listeners need an observable room change even for ready/answer/rating.
            room["revision"] = room.get("revision", 0) + 1
            room["updatedAt"] = now
            state["participants"][uid]["connectedAt"] = now
            host = state["participants"][room["hostUid"]]
            if now - host["connectedAt"] > 180_000:
                room["hostUid"] = uid
            if action == "sync":
                advance_if_needed(state, now, data.get("phaseVersion"))
                return
            if action == "report":
                self._target(state, uid, data["targetUid"])
                if private.get("reportCount", 0) >= 3:
                    raise HTTPException(429, "한 판에서 신고는 최대 3회 가능해요.")
                private["reportCount"] = private.get("reportCount", 0) + 1
                state["reports"].append({"uid": uid, **data, "createdAt": now})
                return
            if action == "ready":
                if room["phase"] != "lobby":
                    raise HTTPException(409, "대기실에서만 준비 상태를 바꿀 수 있어요.")
                state["participants"][uid]["ready"] = data["ready"]
                return
            if action == "start":
                if room["hostUid"] != uid:
                    raise HTTPException(403, "방장만 시작할 수 있어요.")
                if room["phase"] != "lobby":
                    return  # Safe retry never redraws a topic.
                if not 4 <= len(state["participants"]) <= 6:
                    raise HTTPException(409, "4명 이상 모여야 시작할 수 있어요.")
                if not all(p["ready"] for p in state["participants"].values()):
                    raise HTTPException(409, "모든 참가자가 준비 완료를 눌러 주세요.")
                topic = pick_topic(load_topics(), state.get("previousTopicId"), state.get("forcedTopicId"))
                room.update(topic=topic, topicId=topic["topicId"], topicVersion=topic["version"], phase="topic", phaseVersion=1, phaseEndsAt=now + PHASE_SECONDS["topic"] * 1000)
                room["updatedAt"] = now
                return

            if action in ("react", "review-done"):
                if room.get("phaseEndsAt") is not None and now >= room["phaseEndsAt"]:
                    advance_if_needed(state, now)
                if room["phase"] not in REVIEW_PHASES:
                    deferred_error.append("지금은 발언을 함께 확인하는 시간이 아니에요.")
                    return
                if action == "react":
                    self._react(state, uid, data, REVIEW_PHASES[room["phase"]], now)
                else:
                    submitted = state["participants"][uid]["submitted"]
                    if room["phase"] not in submitted:
                        submitted.append(room["phase"])
                    advance_if_needed(state, now)
                return

            old = self._existing(state, uid, action, data)
            if old is not None:
                # Identical requests are idempotent, even after a phase transition.
                if all(old.get(k) == v for k, v in data.items()):
                    return
                raise HTTPException(409, "이미 제출했어요. 제출 내용은 수정할 수 없어요.")
            expected = ACTION_PHASE[action]
            if room.get("phaseEndsAt") is not None and now >= room["phaseEndsAt"]:
                advance_if_needed(state, now)
            if room["phase"] != expected:
                deferred_error.append("제출 시간이 끝났거나 현재 단계에서 할 수 없는 행동이에요.")
                return
            self._submit(state, uid, action, data, now)
            advance_if_needed(state, now)
            room["updatedAt"] = now

        state = self.repository.mutate(room_id, update)
        if deferred_error:
            raise HTTPException(409, deferred_error[0])
        return snapshot(state, uid)

    @staticmethod
    def _target(state, uid, target):
        if target == uid:
            raise HTTPException(422, "자신을 선택할 수 없어요.")
        if target not in state["participants"]:
            raise HTTPException(422, "같은 방의 참가자를 선택해 주세요.")

    @classmethod
    def _react(cls, state, uid, data, round_name, now):
        cls._target(state, uid, data["targetUid"])
        reactions = state["rounds"].setdefault("reactions", [])
        mine = next((r for r in reactions if r["uid"] == uid and r["targetUid"] == data["targetUid"] and r["round"] == round_name), None)
        if mine:
            reactions.remove(mine)
        if data.get("kind"):
            # One public reaction per person, target and round; sending another replaces it.
            reactions.append({"uid": uid, "targetUid": data["targetUid"], "round": round_name, "kind": data["kind"], "at": now})

    @staticmethod
    def _existing(state, uid, action, data):
        if action == "initial-position":
            return state["privatePlayers"][uid].get("initialPosition")
        if action in ("claim", "scenario", "question"):
            return state["submissions"][action].get(uid)
        if action == "guess":
            return state["guesses"].get(uid)
        if action == "rating":
            return state["ratings"].get(f"{uid}_{data['targetUid']}")
        if action == "reflection":
            return state["privatePlayers"][uid].get("reflection")
        if action == "answer":
            q = next((q for q in state["submissions"]["question"].values() if q["questionId"] == data["questionId"]), None)
            if q and q.get("answerUid") == uid:
                return {"text": q["answer"], "questionId": q["questionId"]}
        return None

    def _submit(self, state, uid, action, data, now):
        private = state["privatePlayers"][uid]
        topic = state["room"]["topic"]
        if action == "initial-position":
            if not set(data["preferences"]) <= {r["id"] for r in topic["roles"]}:
                raise HTTPException(422, "오늘 주제에 있는 역할만 선택해 주세요.")
            private["initialPosition"] = copy.deepcopy(data)
        elif action in ("claim", "scenario"):
            if action == "scenario" and data["optionId"] not in {o["id"] for o in topic["scenario"]["options"]}:
                raise HTTPException(422, "오늘 사건에 있는 선택지를 골라 주세요.")
            if data.get("cardId"):
                card = next((card for card in private["cards"] if card["id"] == data["cardId"]), None)
                if not card:
                    raise HTTPException(422, "배정받은 역할의 카드만 사용할 수 있어요.")
                if not data.get("cardConnection"):
                    raise HTTPException(422, "카드가 내 주장과 어떻게 연결되는지 적어 주세요.")
                if data["cardConnection"].strip() in (card["text"].strip(), card["title"].strip()):
                    raise HTTPException(422, "카드를 그대로 복사하지 말고 내 주장과 연결해 주세요.")
            elif data.get("cardConnection"):
                raise HTTPException(422, "연결할 관점 카드를 골라 주세요.")
            state["submissions"][action][uid] = {"uid": uid, **copy.deepcopy(data), "submittedAt": now}
        elif action == "question":
            self._target(state, uid, data["targetUid"])
            state["submissions"]["question"][uid] = {"uid": uid, "questionId": f"q_{uid}", **data, "submittedAt": now}
            state["rounds"]["question"] = copy.deepcopy(list(state["submissions"]["question"].values()))
        elif action == "answer":
            question = next((q for q in state["submissions"]["question"].values() if q["questionId"] == data["questionId"]), None)
            if not question or question["targetUid"] != uid:
                raise HTTPException(403, "나에게 온 질문에만 답할 수 있어요.")
            question.update(answer=data["text"], answerUid=uid, answeredAt=now)
            state["rounds"]["question"] = copy.deepcopy(list(state["submissions"]["question"].values()))
        elif action == "guess":
            self._target(state, uid, data["targetUid"])
            state["guesses"][uid] = {"uid": uid, **data}
        elif action == "rating":
            self._target(state, uid, data["targetUid"])
            state["ratings"][f"{uid}_{data['targetUid']}"] = {"uid": uid, **data}
        elif action == "reflection":
            private["reflection"] = copy.deepcopy(data)
        submitted_phase = ACTION_PHASE[action]
        if submitted_phase not in state["participants"][uid]["submitted"]:
            state["participants"][uid]["submitted"].append(submitted_phase)
