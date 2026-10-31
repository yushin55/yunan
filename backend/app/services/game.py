import copy
import random
import secrets
import uuid

from fastapi import HTTPException

from app.repositories.topics import find_topic, load_game_config, load_topics, public_topic
from app.services.moderation import Moderator, check_rate, validate_text_fields
from app.services.phase_engine import CHAT_PHASES, TIMED_PHASES, advance_if_needed, default_phase_seconds, now_ms, seated, snapshot, start_phase, transition, viewer
from app.services.role_assignment import AssignmentError, assign_roles

HOST_ACTIONS = {"settings", "kick", "start", "pause", "resume", "next", "extend", "end", "review"}
STUDENT_ACTIONS = {"preferences", "confirm-role", "vote"}
MAX_CHAT = 400
MAX_PER_PHASE = 40
MAX_LOG = 100
MAX_NOTICES = 10


def _student(uid, nickname, seat, now):
    return {"uid": uid, "nickname": nickname, "seat": seat, "joinedAt": now, "connectedAt": now, "prefsDone": False, "submitted": []}


def _private():
    # Preferences and switcher status live only here (readable by the student alone) and in the server aggregate.
    return {"preferences": None, "roleId": None, "isSwitcher": None, "preferenceRank": None, "vote": None, "notices": []}


class GameService:
    def __init__(self, repository, clock=now_ms, moderator=None, rng=None):
        self.repository = repository
        self.clock = clock
        self.moderator = moderator or Moderator()
        self.rng = rng or random.SystemRandom()

    # ── Rooms ────────────────────────────────────────────────────────────────
    def create(self, uid, data):
        now = self.clock()
        topic = self._choose_topic(data, current=None)
        config = load_game_config()
        room_id = uuid.uuid4().hex
        state = {
            "room": {
                "roomId": room_id, "code": "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6)),
                "hostUid": uid, "phase": "lobby", "phaseVersion": 0, "phaseEndsAt": None, "paused": False, "pausedRemainingMs": None,
                "participantCount": 0, "minStudents": config["minStudents"], "maxStudents": config["maxStudents"],
                "topicId": topic["topicId"], "topic": public_topic(topic), "event": None,
                "settings": self._settings(data, {"switcherCount": config["defaultSwitcherCount"], "phaseSeconds": default_phase_seconds()}),
                "createdAt": now, "updatedAt": now, "endedAt": None,
            },
            "participants": {}, "privatePlayers": {},
            "host": {"uid": uid, "teacherGuide": copy.deepcopy(topic["teacherGuide"]), "moderation": []},
            "statements": {}, "votes": {}, "rounds": {"statements": [], "chat": []},
            "eventCard": None, "assignment": None, "rate": {}, "seq": 0,
        }
        return snapshot(self.repository.create(state, uid, now), uid)

    def join(self, uid, data):
        validate_text_fields(data)
        room_id = self.repository.resolve(data["code"])
        nickname = data["nickname"].strip()

        def update(state):
            now = self.clock()
            room = state["room"]
            if uid == room["hostUid"]:
                raise HTTPException(409, "선생님 계정으로는 학생으로 입장할 수 없어요. 다른 기기나 브라우저에서 입장해 주세요.")
            if uid in state["participants"]:
                state["participants"][uid]["connectedAt"] = now  # Reconnect: same seat, same role.
                return
            if room["phase"] != "lobby":
                raise HTTPException(409, "이미 시작한 게임이에요. 처음 입장했던 기기로만 다시 들어올 수 있어요.")
            if len(state["participants"]) >= room["maxStudents"]:
                raise HTTPException(409, f"방이 가득 찼어요. 한 게임에는 최대 {room['maxStudents']}명이 참여해요.")
            if any(p["nickname"] == nickname for p in state["participants"].values()):
                raise HTTPException(409, "같은 닉네임이 있어요. 다른 닉네임을 정해 주세요.")
            state["participants"][uid] = _student(uid, nickname, len(state["participants"]), now)
            state["privatePlayers"][uid] = _private()
            room["participantCount"] = len(state["participants"])
            room["updatedAt"] = now

        return snapshot(self.repository.mutate(room_id, update), uid)

    def read(self, room_id, uid):
        return snapshot(self.repository.read(room_id), uid)

    # ── Actions ──────────────────────────────────────────────────────────────
    def action(self, room_id, uid, action, data):
        validate_text_fields(data)
        deferred_error = []

        def update(state):
            deferred_error.clear()  # Firestore may retry this transaction callback.
            now = self.clock()
            role = viewer(state, uid)
            room = state["room"]
            if action == "sync":
                if data.get("phaseVersion") is not None and data["phaseVersion"] != room["phaseVersion"]:
                    return  # Another client already moved this phase on; stay read-only.
                if role == "student":
                    state["participants"][uid]["connectedAt"] = now
                advance_if_needed(state, now, data.get("phaseVersion"))
                return
            if action in HOST_ACTIONS and role != "host":
                raise HTTPException(403, "선생님만 할 수 있는 진행 기능이에요.")
            if action in STUDENT_ACTIONS and role != "student":
                raise HTTPException(403, "학생 참가자만 할 수 있어요.")
            check_rate(state["rate"].setdefault(uid, {}), now)
            if action in HOST_ACTIONS:
                getattr(self, "_host_" + action)(state, data, now)
                return
            # Deadlines are enforced at submission time even if no client has synced yet.
            advance_if_needed(state, now)
            error = self._student_action(state, uid, action, data, now)
            if error:
                deferred_error.append(error)

        state = self.repository.mutate(room_id, update)
        if deferred_error:
            raise HTTPException(409, deferred_error[0])
        return snapshot(state, uid)

    def post_text(self, room_id, uid, kind, data):
        """Statements and chat messages are checked before anyone else can see them."""
        validate_text_fields(data)
        data = {**data, "text": data["text"].strip()}
        precheck = self.repository.read(room_id)
        error = self._text_error(precheck, uid, kind, data)
        if error:
            raise HTTPException(409, error)
        verdict = self.moderator.review(data["text"])
        outcome = {}
        deferred_error = []

        def update(state):
            outcome.clear()
            deferred_error.clear()
            now = self.clock()
            advance_if_needed(state, now)
            error = self._text_error(state, uid, kind, data)
            if error:
                deferred_error.append(error)
                return
            check_rate(state["rate"].setdefault(uid, {}), now)
            state["seq"] += 1
            entry = {
                "id": f"m{state['seq']}", "uid": uid, "kind": kind, "phase": state["room"]["phase"],
                "text": data["text"], "targetUid": data.get("targetUid"), "at": now,
            }
            if kind == "statement":
                self._withdraw_pending_statement(state, uid)
            if verdict.status == "ok":
                self._publish(state, entry, now)
                outcome.update(status="published", messageId=entry["id"])
                return
            status = "needs_edit" if verdict.status == "flag" else "pending_review"
            self._log(state, entry, "flagged" if verdict.status == "flag" else "pending_review", verdict)
            self._notice(state, entry, status, verdict.hint, verdict.excerpt)
            outcome.update(status=status, messageId=entry["id"], hint=verdict.hint, excerpt=verdict.excerpt, category=verdict.category)

        state = self.repository.mutate(room_id, update)
        if deferred_error:
            raise HTTPException(409, deferred_error[0])
        return {**snapshot(state, uid), "moderation": outcome}

    # ── Teacher controls ─────────────────────────────────────────────────────
    def _host_settings(self, state, data, now):
        room = state["room"]
        if room["phase"] != "lobby":
            raise HTTPException(409, "주제와 설정은 게임 시작 전에만 바꿀 수 있어요.")
        if data.get("topicId") or data.get("randomTopic"):
            topic = self._choose_topic(data, current=room["topicId"])
            if topic["topicId"] != room["topicId"]:
                room.update(topicId=topic["topicId"], topic=public_topic(topic))
                state["host"]["teacherGuide"] = copy.deepcopy(topic["teacherGuide"])
                # Preferences belong to the old topic's roles.
                for uid in state["participants"]:
                    state["participants"][uid]["prefsDone"] = False
                    state["privatePlayers"][uid]["preferences"] = None
        room["settings"] = self._settings(data, room["settings"])
        room["updatedAt"] = now

    def _host_kick(self, state, data, now):
        room = state["room"]
        target = data["targetUid"]
        if room["phase"] != "lobby":
            raise HTTPException(409, "게임이 시작된 뒤에는 참가자를 내보낼 수 없어요.")
        if target not in state["participants"]:
            raise HTTPException(404, "이미 나간 참가자예요.")
        del state["participants"][target]
        del state["privatePlayers"][target]
        for seat, uid in enumerate(seated(state)):
            state["participants"][uid]["seat"] = seat
        room["participantCount"] = len(state["participants"])
        room["updatedAt"] = now

    def _host_start(self, state, data, now):
        room = state["room"]
        if room["phase"] != "lobby":
            return  # A retried start never redraws roles.
        count = len(state["participants"])
        if not room["minStudents"] <= count <= room["maxStudents"]:
            raise HTTPException(409, f"학생이 {room['minStudents']}~{room['maxStudents']}명일 때 시작할 수 있어요. 지금은 {count}명이에요.")
        waiting = [p for p in state["participants"].values() if not p["prefsDone"]]
        if waiting:
            raise HTTPException(409, f"아직 선호 역할을 고르지 않은 학생이 {len(waiting)}명 있어요.")
        topic = find_topic(room["topicId"])
        if not topic or topic["version"] != room["topic"]["version"]:
            raise HTTPException(409, "주제 데이터가 바뀌었어요. 주제를 다시 선택해 주세요.")
        preferences = {uid: (p["preferences"]["first"], p["preferences"]["second"]) for uid, p in state["privatePlayers"].items()}
        try:
            result = assign_roles([r["id"] for r in room["topic"]["roles"]], preferences, room["settings"]["switcherCount"], self.rng)
        except AssignmentError as exc:
            raise HTTPException(409, exc.message) from exc
        for uid, assigned in result["assignments"].items():
            state["privatePlayers"][uid].update(assigned)
        # Kept only in the server aggregate for auditing; never projected to any client.
        state["assignment"] = {"topRoleId": result["topRoleId"], "tiedRoleIds": result["tiedRoleIds"], "at": now}
        state["eventCard"] = copy.deepcopy(self.rng.choice(topic["events"]))
        start_phase(state, "role", now)

    def _host_pause(self, state, data, now):
        room = state["room"]
        if room["phase"] not in TIMED_PHASES or room["paused"]:
            return
        room.update(paused=True, pausedRemainingMs=max(0, room["phaseEndsAt"] - now), phaseEndsAt=None, updatedAt=now)

    def _host_resume(self, state, data, now):
        room = state["room"]
        if not room["paused"]:
            return
        room.update(paused=False, phaseEndsAt=now + room["pausedRemainingMs"], pausedRemainingMs=None, updatedAt=now)

    def _host_next(self, state, data, now):
        room = state["room"]
        if data.get("phaseVersion") is not None and data["phaseVersion"] != room["phaseVersion"]:
            return  # Double click: the phase already moved on.
        if room["phase"] in TIMED_PHASES:
            transition(state, now)
        elif room["phase"] == "reveal":
            start_phase(state, "ended", now)
        else:
            raise HTTPException(409, "지금은 다음 단계로 넘길 수 없어요.")

    def _host_extend(self, state, data, now):
        room = state["room"]
        if room["phase"] not in TIMED_PHASES:
            raise HTTPException(409, "시간을 늘릴 수 있는 단계가 아니에요.")
        if room["paused"]:
            room["pausedRemainingMs"] += data["seconds"] * 1000
        else:
            room["phaseEndsAt"] = max(room["phaseEndsAt"], now) + data["seconds"] * 1000
        room["updatedAt"] = now

    def _host_end(self, state, data, now):
        if state["room"]["phase"] == "reveal":
            start_phase(state, "ended", now)
        elif state["room"]["phase"] != "ended":
            raise HTTPException(409, "정체와 투표 결과를 공개한 뒤에 게임을 끝낼 수 있어요.")

    def _host_review(self, state, data, now):
        entry = next((e for e in state["host"]["moderation"] if e["id"] == data["entryId"]), None)
        if not entry or entry["status"] not in ("pending_review", "flagged"):
            raise HTTPException(409, "이미 처리된 메시지예요.")
        if entry["uid"] not in state["participants"]:
            raise HTTPException(409, "방을 나간 학생의 메시지예요.")
        if data["decision"] == "approve":
            if entry["kind"] == "statement" and entry["uid"] in state["statements"] and state["room"]["phase"] == "statement":
                raise HTTPException(409, "이 학생의 입장 발표가 이미 공개되었어요.")
            entry["status"] = "approved"
            self._publish(state, {k: entry[k] for k in ("id", "uid", "kind", "phase", "text", "targetUid", "at")}, now, via_teacher=True)
            self._update_notice(state, entry, "approved")
        else:
            entry["status"] = "returned"
            self._update_notice(state, entry, "returned")
        entry["reviewedAt"] = now

    # ── Student actions ──────────────────────────────────────────────────────
    def _student_action(self, state, uid, action, data, now):
        room = state["room"]
        private = state["privatePlayers"][uid]
        participant = state["participants"][uid]
        if action == "preferences":
            if room["phase"] != "lobby":
                return "게임이 시작되어 선호 역할을 바꿀 수 없어요."
            role_ids = {r["id"] for r in room["topic"]["roles"]}
            if data["first"] not in role_ids or data["second"] not in role_ids:
                raise HTTPException(422, "이 주제에 있는 역할만 고를 수 있어요.")
            private["preferences"] = {"first": data["first"], "second": data["second"]}
            participant["prefsDone"] = True
            return None
        if room["paused"]:
            return "선생님이 진행을 잠시 멈췄어요. 다시 시작하면 이어서 할 수 있어요."
        if action == "confirm-role":
            if room["phase"] != "role":
                return None  # Late confirmation after the phase moved on is harmless.
            if "role" not in participant["submitted"]:
                participant["submitted"].append("role")
            advance_if_needed(state, now)
            return None
        if action == "vote":
            targets = data["targets"]
            if private["vote"] is not None:
                if sorted(private["vote"]) == sorted(targets):
                    return None  # Idempotent retry.
                raise HTTPException(409, "이미 투표했어요. 투표는 바꿀 수 없어요.")
            if room["phase"] != "vote":
                return "투표 시간이 아니에요."
            needed = room["settings"]["switcherCount"]
            if len(targets) != needed or len(set(targets)) != needed:
                raise HTTPException(422, f"서로 다른 후보 {needed}명을 골라 주세요.")
            if uid in targets:
                raise HTTPException(422, "자기 자신에게는 투표할 수 없어요.")
            if not set(targets) <= state["participants"].keys():
                raise HTTPException(422, "이 방의 참가자에게만 투표할 수 있어요.")
            state["votes"][uid] = list(targets)
            private["vote"] = list(targets)
            participant["submitted"].append("vote")
            advance_if_needed(state, now)
            return None
        raise HTTPException(404, "알 수 없는 행동이에요.")

    # ── Helpers ──────────────────────────────────────────────────────────────
    def _text_error(self, state, uid, kind, data):
        if viewer(state, uid) != "student":
            raise HTTPException(403, "학생 참가자만 발언할 수 있어요.")
        room = state["room"]
        limits = load_game_config()["textLimits"]
        if not data["text"] or len(data["text"]) > limits["statement" if kind == "statement" else "message"]:
            raise HTTPException(422, "발언 길이를 확인해 주세요.")
        if room["paused"]:
            return "선생님이 진행을 잠시 멈췄어요. 다시 시작하면 이어서 할 수 있어요."
        if kind == "statement":
            if room["phase"] != "statement":
                return "입장 발표 시간이 끝났어요."
            if uid in state["statements"]:
                return "입장 발표는 한 번만 할 수 있어요."
            return None
        if room["phase"] not in CHAT_PHASES:
            return "지금은 채팅으로 발언하는 단계가 아니에요."
        if kind not in CHAT_PHASES[room["phase"]]:
            return "이 단계에서 쓸 수 없는 발언 종류예요."
        target = data.get("targetUid")
        if target is not None and (target == uid or target not in state["participants"]):
            raise HTTPException(422, "다른 참가자를 골라 주세요.")
        mine = sum(1 for m in state["rounds"]["chat"] if m["uid"] == uid and m["phase"] == room["phase"])
        if mine >= MAX_PER_PHASE or len(state["rounds"]["chat"]) >= MAX_CHAT:
            return "이 단계에서 보낼 수 있는 메시지 수를 넘었어요."
        return None

    def _publish(self, state, entry, now, via_teacher=False):
        uid = entry["uid"]
        if entry["kind"] == "statement":
            row = {"uid": uid, "text": entry["text"], "at": now, **({"viaTeacher": True} if via_teacher else {})}
            if state["room"]["phase"] == "statement":
                state["statements"][uid] = row
                if "statement" not in state["participants"][uid]["submitted"]:
                    state["participants"][uid]["submitted"].append("statement")
                advance_if_needed(state, now)
            else:
                # Approved after the statement round closed: replace the "no statement" row.
                state["statements"][uid] = row
                rows = state["rounds"]["statements"]
                index = next((i for i, r in enumerate(rows) if r["uid"] == uid), None)
                if index is None:
                    rows.append({**row, "late": True})
                else:
                    rows[index] = {**row, "late": True}
            return
        message = {k: entry[k] for k in ("id", "uid", "kind", "phase", "text", "targetUid")}
        message["at"] = now
        if via_teacher:
            message["viaTeacher"] = True
        state["rounds"]["chat"].append(message)

    def _withdraw_pending_statement(self, state, uid):
        for entry in state["host"]["moderation"]:
            if entry["uid"] == uid and entry["kind"] == "statement" and entry["status"] in ("pending_review", "flagged"):
                entry["status"] = "withdrawn"
                self._update_notice(state, entry, "withdrawn")

    def _log(self, state, entry, status, verdict):
        log = state["host"]["moderation"]
        log.append({**entry, "nickname": state["participants"][entry["uid"]]["nickname"], "status": status,
                    "category": verdict.category, "excerpt": verdict.excerpt, "source": verdict.source})
        del log[:-MAX_LOG]

    def _notice(self, state, entry, status, hint, excerpt):
        notices = state["privatePlayers"][entry["uid"]]["notices"]
        notices.append({"id": entry["id"], "kind": entry["kind"], "phase": entry["phase"], "status": status, "hint": hint,
                        "excerpt": excerpt, "text": entry["text"], "targetUid": entry["targetUid"], "at": entry["at"]})
        del notices[:-MAX_NOTICES]

    @staticmethod
    def _update_notice(state, entry, status):
        private = state["privatePlayers"].get(entry["uid"])
        for notice in private["notices"] if private else []:
            if notice["id"] == entry["id"]:
                notice["status"] = status

    def _choose_topic(self, data, current):
        topics = load_topics()
        if data.get("topicId"):
            topic = find_topic(data["topicId"])
            if not topic:
                raise HTTPException(422, "등록된 주제 6개 중에서 골라 주세요.")
            return topic
        if data.get("randomTopic"):
            # Random choice only among the reviewed topics; never a newly generated one.
            return self.rng.choice([t for t in topics if t["topicId"] != current] or list(topics))
        if current is None:
            raise HTTPException(422, "주제를 고르거나 무작위 주제를 선택해 주세요.")
        return find_topic(current)

    @staticmethod
    def _settings(data, current):
        config = load_game_config()
        result = copy.deepcopy(current)
        if data.get("switcherCount") is not None:
            if data["switcherCount"] not in config["switcherCounts"]:
                raise HTTPException(422, "역할 전환자는 1명 또는 2명으로 정할 수 있어요.")
            result["switcherCount"] = data["switcherCount"]
        bounds = config["phaseSecondsRange"]
        for phase, seconds in (data.get("phaseSeconds") or {}).items():
            if seconds is None:
                continue
            if phase not in TIMED_PHASES or not bounds["min"] <= seconds <= bounds["max"]:
                raise HTTPException(422, f"단계 시간은 {bounds['min']}~{bounds['max']}초 사이로 정해 주세요.")
            result["phaseSeconds"][phase] = seconds
        return result
