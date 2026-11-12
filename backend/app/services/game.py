import copy
import logging
import random
import secrets
import uuid

from fastapi import HTTPException

from app.repositories.topics import find_topic, load_game_config, load_topics, public_topic
from app.services.ai import AIUnavailable
from app.services.discussion import build_summary, transcribe
from app.services.student_report import build_student_reports
from app.services.moderation import Moderator, check_rate, validate_text_fields
from app.services.phase_engine import MAX_TURNS, TIMED_PHASES, advance_if_needed, default_phase_seconds, finish_phase, in_qa, mic_kinds, next_turn, now_ms, seated, snapshot, start_phase, transition, viewer
from app.services.role_assignment import AssignmentError, assign_roles

logger = logging.getLogger(__name__)

HOST_ACTIONS = {"settings", "intro", "kick", "start", "pause", "resume", "next", "skip-phase", "speaker", "extend", "end", "review", "line-edit", "line-delete"}
STUDENT_ACTIONS = {"preferences", "confirm-role", "end-turn", "mic-on", "mic-off", "vote"}
MAX_LINES = 300
MAX_LOG = 100
MAX_FLOORS = 300  # The log of who spoke lives in the room document, which has a size limit.
LINE_LIMIT = 400
LATEST = 10 ** 9  # Typed lines have no clip number; they follow what the microphone caught in that turn.
LATE_AUDIO_MS = 90_000  # Audio said in time can still be on its way, with one retry, after the floor moved on.
AUTO_START_MS = 3000  # Same 3, 2, 1 the screens show once everyone has picked their roles.


def _student(uid, nickname, seat, now):
    return {"uid": uid, "nickname": nickname, "seat": seat, "joinedAt": now, "connectedAt": now, "prefsDone": False, "submitted": []}


def _private():
    # Preferences and switcher status live only here (readable by the student alone) and in the server aggregate.
    return {"preferences": None, "roleId": None, "isSwitcher": None, "preferenceRank": None, "vote": None}


class GameService:
    def __init__(self, repository, clock=now_ms, moderator=None, rng=None, transcriber=transcribe, summarizer=build_summary, reporter=build_student_reports):
        self.repository = repository
        self.clock = clock
        self.moderator = moderator or Moderator()
        self.rng = rng or random.SystemRandom()
        self.transcriber = transcriber
        self.summarizer = summarizer
        self.reporter = reporter

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
                "topicId": topic["topicId"], "topic": public_topic(topic), "event": None, "turn": None, "floor": None,
                "settings": self._settings(data, {"switcherCount": config["defaultSwitcherCount"], "phaseSeconds": default_phase_seconds(), "micSeconds": config["micSeconds"]}),
                "createdAt": now, "updatedAt": now, "endedAt": None,
                # The videos before the game: the teacher moves everyone through them together.
                "intro": {"step": "waiting", "startedAt": None},
            },
            "participants": {}, "privatePlayers": {},
            "host": {"uid": uid, "teacherGuide": copy.deepcopy(topic["teacherGuide"]), "moderation": []},
            "votes": {}, "rounds": {"transcript": []}, "turnLog": {}, "transcriptRev": 0,
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
                raise HTTPException(409, "같은 이름이 이미 들어와 있어요. 구분할 수 있게 적어 주세요. (예: 김민준2)")
            state["participants"][uid] = _student(uid, nickname, len(state["participants"]), now)
            state["privatePlayers"][uid] = _private()
            room["participantCount"] = len(state["participants"])
            room["updatedAt"] = now
            self._arm_start(state, now)

        return snapshot(self.repository.mutate(room_id, update), uid)

    def read(self, room_id, uid):
        return snapshot(self.repository.read(room_id), uid)

    # ── Actions ──────────────────────────────────────────────────────────────
    def action(self, room_id, uid, action, data):
        validate_text_fields(data)
        deferred_error = []
        spoke = []

        def update(state):
            deferred_error.clear()  # Firestore may retry this transaction callback.
            spoke.clear()
            now = self.clock()
            role = viewer(state, uid)
            room = state["room"]
            before = (room["phase"], (room.get("turn") or {}).get("uid"))
            self._apply(state, uid, role, action, data, now, deferred_error)
            # A statement turn just ended: its card needs a summary.
            if before[0] == "statement" and before[1] and before != (room["phase"], (room.get("turn") or {}).get("uid")):
                spoke.append(before[1])

        state = self.repository.mutate(room_id, update)
        if spoke:
            state = self._refresh_summary(room_id, state, quiet=True)
        if deferred_error:
            raise HTTPException(409, deferred_error[0])
        return snapshot(state, uid)

    def _apply(self, state, uid, role, action, data, now, deferred_error):
        room = state["room"]
        if action == "sync":
            if data.get("phaseVersion") is not None and data["phaseVersion"] != room["phaseVersion"]:
                return  # Another client already moved this phase on; stay read-only.
            if role == "student":
                state["participants"][uid]["connectedAt"] = now
            if room["phase"] == "lobby" and room.get("phaseEndsAt") and now >= room["phaseEndsAt"]:
                self._auto_start(state, now)
                return
            advance_if_needed(state, now, data.get("phaseVersion"))
            return
        if action in HOST_ACTIONS and role != "host":
            raise HTTPException(403, "선생님만 할 수 있는 진행 기능이에요.")
        if action in STUDENT_ACTIONS and role != "student":
            raise HTTPException(403, "학생 참가자만 할 수 있어요.")
        check_rate(state["rate"].setdefault(uid, {}), now)
        if action in HOST_ACTIONS:
            getattr(self, "_host_" + action.replace("-", "_"))(state, data, now)
            return
        # Deadlines are enforced at submission time even if no client has synced yet.
        advance_if_needed(state, now)
        error = self._student_action(state, uid, action, data, now)
        if error:
            deferred_error.append(error)

    # ── Discussion record ────────────────────────────────────────────────────
    def speech(self, room_id, uid, data):
        """A student's microphone: only what they said while holding the floor is transcribed."""
        version = data["phaseVersion"]

        def gate(state):
            # Rate-limited before the paid transcription call, not after it.
            turn = self._turn_of(state, version)
            if viewer(state, uid) != "student" or turn["uid"] != uid:
                raise HTTPException(403, "마이크를 켠 학생의 기기에서만 녹음할 수 있어요.")
            if self.clock() > turn.get("until", 0) + LATE_AUDIO_MS:
                raise HTTPException(409, "마이크를 켜고 말한 내용만 기록할 수 있어요.")
            self._check_room_for_line(state)
            check_rate(state["rate"].setdefault(uid, {}), self.clock())

        self.repository.mutate(room_id, gate)
        try:
            text = self.transcriber(data["audio"], data["mimeType"])
        except AIUnavailable as exc:
            # The reason (an invalid API key, a timeout) only goes to the server log, never to the student.
            logger.error("Transcription failed: %s", exc)
            raise HTTPException(503, "음성을 글로 바꾸지 못했어요. 잠시 후 다시 시도하거나 직접 입력해 주세요.") from exc
        if not text:
            return {**self.read(room_id, uid), "speech": "silent"}
        return self._post_line(room_id, uid, text[:LINE_LIMIT], version, "voice", data.get("clip"))

    def add_line(self, room_id, uid, data):
        """Typed by the teacher when a microphone missed something. Goes to the current speaker."""
        validate_text_fields(data)
        state = self.repository.read(room_id)
        if viewer(state, uid) != "host":
            raise HTTPException(403, "선생님만 발언 기록을 넣을 수 있어요.")
        version = data.get("phaseVersion")
        if version is None:
            if not (state["room"].get("turn") or state["room"].get("floor")):
                raise HTTPException(409, "지금 말하는 사람이 없어요.")
            version = state["room"]["phaseVersion"]
        return self._post_line(room_id, uid, data["text"].strip(), version, "typed")

    def _post_line(self, room_id, uid, text, version, source, clip=None):
        verdict = self.moderator.review(text)
        outcome = {}

        def update(state):
            outcome.clear()
            now = self.clock()
            turn = self._turn_of(state, version)
            self._check_room_for_line(state)
            state["seq"] += 1
            entry = {"id": f"m{state['seq']}", "uid": turn["uid"], "phase": turn["phase"], "kind": turn["kind"], "turn": version, "clip": clip, "text": text, "source": source, "at": now}
            if verdict.status == "ok":
                self._publish(state, entry)
                outcome["speech"] = "published"
                outcome["late_statement"] = turn["kind"] == "statement" and version != state["room"]["phaseVersion"]
            else:
                self._log(state, entry, "flagged" if verdict.status == "flag" else "pending_review", verdict)
                outcome["speech"] = "held"
            advance_if_needed(state, now)

        state = self.repository.mutate(room_id, update)
        if outcome["speech"] == "published" and outcome.get("late_statement"):
            state = self._refresh_summary(room_id, state, quiet=True)  # Words that arrived after the turn ended.
        return {**snapshot(state, uid), **outcome}

    def summarize(self, room_id, uid):
        state = self.repository.read(room_id)
        if viewer(state, uid) != "host":
            raise HTTPException(403, "선생님 화면에서만 정리할 수 있어요.")
        return snapshot(self._refresh_summary(room_id, state), uid)

    def _refresh_summary(self, room_id, state, quiet=False):
        """The AI summary of the record so far. Called by the teacher's screen and, `quiet`, by the
        server itself whenever a statement turn ends, so the cards fill even with no teacher screen.
        The AI call runs outside the transaction; a failure leaves the old summary (quiet) or is a 503."""
        revision = state.get("transcriptRev", 0)
        current = state["rounds"].get("summary")
        lines = state["rounds"].get("transcript", [])
        if not lines or (current and current["revision"] >= revision):
            return state  # Nothing new: no AI call.
        people = state["participants"]
        try:
            # The AI sees a seat number, never who that is; the number is mapped back to a person here.
            summary = self.summarizer(state["room"]["topic"], [{"roleId": people[l["uid"]].get("roleId"), "speaker": people[l["uid"]]["seat"] + 1, "phase": l["phase"], "kind": l["kind"], "text": l["text"]} for l in lines])
        except AIUnavailable as exc:
            if quiet:
                return state
            raise HTTPException(503, "토론 정리를 만들지 못했어요. 발언 기록은 그대로 남아 있어요.") from exc
        seats = {p["seat"] + 1: p["uid"] for p in people.values()}
        summary["statements"] = [{"uid": seats[row["speaker"]], "text": row["text"]} for row in summary.get("statements", []) if row["speaker"] in seats]

        def update(fresh):
            existing = fresh["rounds"].get("summary")
            if not existing or existing["revision"] <= revision:
                fresh["rounds"]["summary"] = {**summary, "revision": revision, "at": self.clock()}

        return self.repository.mutate(room_id, update)

    def student_reports(self, room_id, uid):
        """AI drafts of each student's evaluation, for the teacher only, once the result is out.
        Not stored: the teacher's screen keeps (and edits) its own copy."""
        state = self.repository.read(room_id)
        if viewer(state, uid) != "host":
            raise HTTPException(403, "선생님 화면에서만 만들 수 있어요.")
        if state["room"]["phase"] not in ("reveal", "ended"):
            raise HTTPException(409, "학생별 리포트는 결과 공개 뒤에 만들 수 있어요.")
        lines = state["rounds"].get("transcript", [])
        if not lines:
            raise HTTPException(409, "기록된 발언이 없어 리포트를 만들 수 없어요.")
        people = state["participants"]
        try:
            # Seat numbers and role names only; nicknames and switcher status never reach the AI.
            reports = self.reporter(state["room"]["topic"], [{"speaker": people[l["uid"]]["seat"] + 1, "roleId": people[l["uid"]].get("roleId"), "phase": l["phase"], "kind": l["kind"], "text": l["text"]} for l in lines])
        except AIUnavailable as exc:
            raise HTTPException(503, "AI가 학생별 리포트를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.") from exc
        seats = {p["seat"] + 1: p["uid"] for p in people.values()}
        ids = [l["id"] for l in lines]

        def line_ids(numbers):
            return [ids[n - 1] for n in numbers]

        out = []
        for r in reports:
            if r["speaker"] not in seats:
                continue
            out.append({
                "uid": seats[r["speaker"]],
                "overall": r["overall"],
                "points": [{**p, "evidence": line_ids(p["evidence"])} for p in r["points"]],
                "strengths": [{**i, "evidence": line_ids(i["evidence"])} for i in r["strengths"]],
                "improvements": [{**i, "evidence": line_ids(i["evidence"])} for i in r["improvements"]],
                "record": r["record"],
            })
        return {"reports": out, "source": "ai", "at": self.clock()}

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
                if room.get("intro"):
                    room["intro"] = {"step": "waiting", "startedAt": None}  # The briefing belongs to the old topic too.
        room["settings"] = self._settings(data, room["settings"])
        room["updatedAt"] = now
        self._arm_start(state, now)

    def _host_intro(self, state, data, now):
        """Briefing video, rules video, then role picking: every student's screen follows the teacher's.
        `startedAt` lets each screen play from the same moment, including someone who joins late."""
        room = state["room"]
        if room["phase"] != "lobby":
            raise HTTPException(409, "영상과 역할 고르기는 게임 시작 전에만 진행할 수 있어요.")
        room.update(intro={"step": data["step"], "startedAt": now}, updatedAt=now)

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
        self._arm_start(state, now)

    def _arm_start(self, state, now):
        """Everyone has picked their roles: start by itself in 3 seconds, even with the teacher's screen closed.
        The countdown is the lobby's `phaseEndsAt`, so the screens' deadline sync is what starts it."""
        room = state["room"]
        people = state["participants"].values()
        ready = room["minStudents"] <= len(people) <= room["maxStudents"] and all(p["prefsDone"] for p in people)
        room["phaseEndsAt"] = (room.get("phaseEndsAt") or now + AUTO_START_MS) if ready else None

    def _auto_start(self, state, now):
        try:
            self._host_start(state, {}, now)
        except HTTPException:
            state["room"]["phaseEndsAt"] = None  # Left for the teacher, who sees why it cannot start.

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
        room.update(paused=True, pausedRemainingMs=max(0, room["phaseEndsAt"] - now), phaseEndsAt=None, floor=None, updatedAt=now)

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

    def _host_skip_phase(self, state, data, now):
        room = state["room"]
        if data.get("phaseVersion") is not None and data["phaseVersion"] != room["phaseVersion"]:
            return
        if room["phase"] not in TIMED_PHASES:
            raise HTTPException(409, "지금은 다음 단계로 넘길 수 없어요.")
        finish_phase(state, now)

    def _host_speaker(self, state, data, now):
        """Give the next statement to someone right now. The queue then carries on."""
        room = state["room"]
        turn = room.get("turn")
        target = data["targetUid"]
        if not turn or in_qa(room):
            raise HTTPException(409, "차례대로 말하는 단계에서만 차례를 줄 수 있어요.")
        if target not in state["participants"]:
            raise HTTPException(404, "이 방의 참가자가 아니에요.")
        if target == turn["uid"] or (data.get("phaseVersion") is not None and data["phaseVersion"] != room["phaseVersion"]):
            return
        if len(turn["order"]) >= MAX_TURNS:
            raise HTTPException(409, "이 단계에서 지목할 수 있는 횟수를 넘었어요.")
        index = turn["index"]
        turn["order"] = turn["order"][:index + 1] + [target] + [u for u in turn["order"][index + 1:] if u != target]
        next_turn(state, now)

    def _host_extend(self, state, data, now):
        room = state["room"]
        if room["phase"] not in TIMED_PHASES:
            raise HTTPException(409, "시간을 늘릴 수 있는 단계가 아니에요.")
        if room["paused"]:
            room["pausedRemainingMs"] += data["seconds"] * 1000
        else:
            room["phaseEndsAt"] = max(room["phaseEndsAt"], now) + data["seconds"] * 1000
            if room.get("turn") and room.get("floor") and not in_qa(room):
                # A turn's microphone stays on for the whole turn, however long it gets.
                room["floor"]["endsAt"] = room["phaseEndsAt"]
                state["turnLog"][str(room["floor"]["version"])]["until"] = room["phaseEndsAt"]
        room["updatedAt"] = now

    def _host_end(self, state, data, now):
        if state["room"]["phase"] == "reveal":
            start_phase(state, "ended", now)
        elif state["room"]["phase"] != "ended":
            raise HTTPException(409, "정체와 투표 결과를 공개한 뒤에 게임을 끝낼 수 있어요.")

    def _host_review(self, state, data, now):
        entry = next((e for e in state["host"]["moderation"] if e["id"] == data["entryId"]), None)
        if not entry or entry["status"] not in ("pending_review", "flagged"):
            raise HTTPException(409, "이미 처리한 발언이에요.")
        if data["decision"] == "approve":
            entry["status"] = "approved"
            self._publish(state, {k: entry[k] for k in ("id", "uid", "phase", "kind", "turn", "clip", "text", "source", "at")}, via_teacher=True)
        else:
            entry["status"] = "returned"
        entry["reviewedAt"] = now

    def _host_line_edit(self, state, data, now):
        """Speech recognition makes mistakes; the teacher corrects them on the shared record."""
        line = self._line(state, data["lineId"])
        line["text"] = data["text"].strip()
        line["editedAt"] = now
        state["transcriptRev"] = state.get("transcriptRev", 0) + 1

    def _host_line_delete(self, state, data, now):
        line = self._line(state, data["lineId"])
        state["rounds"]["transcript"].remove(line)
        state["transcriptRev"] = state.get("transcriptRev", 0) + 1

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
            self._arm_start(state, now)
            return None
        if action == "mic-off":
            floor = room.get("floor")
            if floor and floor["uid"] == uid and data.get("phaseVersion") in (None, floor["version"]):
                room.update(floor=None, updatedAt=now)
            return None  # The time limit or a pause may already have switched it off.
        if room["paused"]:
            return "선생님이 진행을 잠시 멈췄어요. 다시 시작하면 이어서 할 수 있어요."
        if action == "confirm-role":
            if room["phase"] != "role":
                return None  # Late confirmation after the phase moved on is harmless.
            if "role" not in participant["submitted"]:
                participant["submitted"].append("role")
            advance_if_needed(state, now)
            return None
        if action == "end-turn":
            turn = room.get("turn")
            if turn and turn["uid"] == uid and data.get("phaseVersion") in (None, room["phaseVersion"]):
                transition(state, now)
            return None  # A late tap after the floor moved on is harmless.
        if action == "mic-on":
            return self._mic_on(state, uid, data["kind"], now)
        if action == "vote":
            targets = data["targets"]
            if room["phase"] != "vote":
                if private["vote"] is not None and sorted(private["vote"]) == sorted(targets):
                    return None  # A retry that arrives after the vote closed.
                return "투표 시간이 아니에요."
            needed = room["settings"]["switcherCount"]
            if len(targets) != needed or len(set(targets)) != needed:
                raise HTTPException(422, f"서로 다른 후보 {needed}명을 골라 주세요.")
            if uid in targets:
                raise HTTPException(422, "자기 자신에게는 투표할 수 없어요.")
            if not set(targets) <= state["participants"].keys():
                raise HTTPException(422, "이 방의 참가자에게만 투표할 수 있어요.")
            # A new vote replaces the old one until the timer ends.
            state["votes"][uid] = list(targets)
            private["vote"] = list(targets)
            if "vote" not in participant["submitted"]:
                participant["submitted"].append("vote")
            return None
        raise HTTPException(404, "알 수 없는 행동이에요.")

    def _mic_on(self, state, uid, kind, now):
        """One microphone in the room. This check is what stops two people talking into the record."""
        room = state["room"]
        if kind not in mic_kinds(room):
            return "지금은 이 버튼으로 마이크를 켤 수 없어요."
        floor = room.get("floor")
        if floor and floor["endsAt"] > now:
            if floor["uid"] == uid and floor["kind"] == kind:
                return None  # Idempotent retry.
            return f"{state['participants'][floor['uid']]['nickname']}님이 말하고 있어요. 끝나면 마이크를 켤 수 있어요."
        turn = room.get("turn")
        if turn and not in_qa(room):
            if turn["uid"] != uid:
                return "내 차례가 오면 마이크를 켤 수 있어요."
            ends = room["phaseEndsAt"]
        else:
            if len(state["turnLog"]) >= MAX_FLOORS:
                return "이 게임에서 마이크를 켤 수 있는 횟수를 넘었어요."
            room["phaseVersion"] += 1
            ends = min(now + room["settings"]["micSeconds"] * 1000, room["phaseEndsAt"])
            state["turnLog"][str(room["phaseVersion"])] = {"uid": uid, "phase": room["phase"], "kind": kind}
        state["turnLog"][str(room["phaseVersion"])]["until"] = ends
        room.update(floor={"uid": uid, "kind": kind, "version": room["phaseVersion"], "endsAt": ends}, updatedAt=now)
        return None

    # ── Helpers ──────────────────────────────────────────────────────────────
    @staticmethod
    def _turn_of(state, version):
        turn = state.get("turnLog", {}).get(str(version))
        if not turn:
            raise HTTPException(409, "지금은 말하는 단계가 아니에요.")
        return turn

    @staticmethod
    def _check_room_for_line(state):
        if len(state["rounds"].get("transcript", [])) >= MAX_LINES:
            raise HTTPException(409, "이 게임에서 기록할 수 있는 발언 수를 넘었어요.")

    @staticmethod
    def _line(state, line_id):
        line = next((l for l in state["rounds"].get("transcript", []) if l["id"] == line_id), None)
        if not line:
            raise HTTPException(404, "이미 지운 발언이에요.")
        return line

    @staticmethod
    def _publish(state, entry, via_teacher=False):
        line = {**entry, **({"viaTeacher": True} if via_teacher else {})}
        lines = state["rounds"].setdefault("transcript", [])
        lines.append(line)
        # A line that arrived or was approved late goes back to where it was said.
        lines.sort(key=lambda l: (l["turn"], LATEST if l.get("clip") is None else l["clip"], int(l["id"][1:])))
        state["transcriptRev"] = state.get("transcriptRev", 0) + 1

    def _log(self, state, entry, status, verdict):
        log = state["host"]["moderation"]
        speaker = state["participants"].get(entry["uid"])
        log.append({**entry, "nickname": speaker["nickname"] if speaker else "", "status": status,
                    "category": verdict.category, "excerpt": verdict.excerpt, "verdictSource": verdict.source})
        del log[:-MAX_LOG]

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
        if data.get("micSeconds") is not None:
            result["micSeconds"] = data["micSeconds"]
        if data.get("switcherCount") is not None:
            if data["switcherCount"] not in config["switcherCounts"]:
                raise HTTPException(422, "역할 전환자는 1명 또는 2명으로 정할 수 있어요.")
            result["switcherCount"] = data["switcherCount"]
        bounds = config["phaseSecondsRange"]
        for phase, seconds in (data.get("phaseSeconds") or {}).items():
            if seconds is None or phase == "rebuttal":
                continue
            if phase not in TIMED_PHASES or not bounds["min"] <= seconds <= bounds["max"]:
                raise HTTPException(422, f"단계 시간은 {bounds['min']}~{bounds['max']}초 사이로 정해 주세요.")
            result["phaseSeconds"][phase] = seconds
        return result
