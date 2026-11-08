"""Phase order, deadlines and per-viewer snapshots.

lobby (topic, rules, role preferences) → role (secret role) → statement (then questions about the
statements) → event (event card, questions and answers) → vote → reveal → ended. Nothing after the reveal asks for
a student's real opinion.

Students talk out loud, each into their own device, and only one microphone in the room can be on
(`room.floor`). Statements go in seat order: `room.turn` says whose turn it is and `phaseEndsAt` is
the deadline of that turn. After the last statement `turn.stage` becomes "qa" for `qaSeconds`, and in
the event phase the floor is open from the start. On an open floor anyone can take the microphone to ask or
answer, for at most `micSeconds`, until `phaseEndsAt` ends the phase.

Every turn, and every time someone takes the open floor, gets its own `phaseVersion`. That is how a
chunk of audio finds its speaker when it arrives after the floor has moved on.
"""
import copy
import time

from fastapi import HTTPException

from app.repositories.topics import load_game_config
from app.services.voting import build_reveal

PHASES = ["lobby", "role", "statement", "event", "vote", "reveal", "ended"]
TIMED_PHASES = ("role", "statement", "event", "vote")
SPEAKING_PHASES = ("statement", "event")
# What the two microphone buttons say in each speaking phase. The first is Z, the second X.
MIC_KINDS = {"statement": ("statement",), "event": ("question", "answer")}
OPEN_KINDS = ("question", "answer")  # Statement Q&A uses the event phase's buttons.
MAX_TURNS = 40


def now_ms():
    return int(time.time() * 1000)


def default_phase_seconds() -> dict:
    return dict(load_game_config()["phaseSeconds"])


def viewer(state: dict, uid: str) -> str:
    if uid == state["room"]["hostUid"]:
        return "host"
    if uid in state["participants"]:
        return "student"
    raise HTTPException(403, "이 방의 참가자만 접근할 수 있어요.")


def seated(state: dict) -> list[str]:
    return sorted(state["participants"], key=lambda uid: state["participants"][uid]["seat"])


def _log_turn(state: dict) -> None:
    room = state["room"]
    state.setdefault("turnLog", {})[str(room["phaseVersion"])] = {"uid": room["turn"]["uid"], "phase": room["phase"], "kind": "statement"}


def start_phase(state: dict, phase: str, now: int) -> None:
    room = state["room"]
    seconds = room["settings"]["phaseSeconds"].get(phase) if phase in TIMED_PHASES else None
    room.update(phase=phase, phaseVersion=room["phaseVersion"] + 1, phaseEndsAt=now + seconds * 1000 if seconds else None,
                paused=False, pausedRemainingMs=None, updatedAt=now, turn=None, floor=None)
    if phase == "statement" and state["participants"]:
        order = seated(state)
        room["turn"] = {"order": order, "index": 0, "uid": order[0], "stage": "speech"}
        _log_turn(state)
    if phase == "ended":
        room["endedAt"] = now


def in_qa(room: dict) -> bool:
    return (room.get("turn") or {}).get("stage") == "qa"


def mic_kinds(room: dict) -> tuple:
    return OPEN_KINDS if in_qa(room) else MIC_KINDS.get(room["phase"], ())


def start_qa(state: dict, now: int) -> None:
    """Everyone has made their statement: anyone can now ask about them."""
    room = state["room"]
    room["turn"].update(stage="qa", uid=None)
    room.update(phaseVersion=room["phaseVersion"] + 1, phaseEndsAt=now + load_game_config()["qaSeconds"] * 1000,
                paused=False, pausedRemainingMs=None, updatedAt=now, floor=None)


def next_turn(state: dict, now: int) -> bool:
    """Hand the floor to the next speaker. False when everyone in this phase has had their turn."""
    room = state["room"]
    turn = room.get("turn")
    if not turn or in_qa(room) or turn["index"] + 1 >= len(turn["order"]):
        return False
    turn["index"] += 1
    turn["uid"] = turn["order"][turn["index"]]
    room.update(phaseVersion=room["phaseVersion"] + 1, phaseEndsAt=now + room["settings"]["phaseSeconds"][room["phase"]] * 1000,
                paused=False, pausedRemainingMs=None, updatedAt=now, floor=None)
    _log_turn(state)
    return True


def finish_phase(state: dict, now: int) -> None:
    room = state["room"]
    phase = room["phase"]
    if phase in ("lobby", "ended"):
        return
    if phase == "role":
        # Roles become public table information; switcher status stays private.
        for uid in state["participants"]:
            state["participants"][uid]["roleId"] = state["privatePlayers"][uid]["roleId"]
    elif phase == "statement":
        room["event"] = copy.deepcopy(state["eventCard"])
    elif phase == "vote":
        state["rounds"]["reveal"] = build_reveal(state)
    start_phase(state, PHASES[PHASES.index(phase) + 1], now)


def transition(state: dict, now: int) -> None:
    """The next step of the game: the next speaker, then statement Q&A, then the next phase."""
    room = state["room"]
    if next_turn(state, now):
        return
    if room.get("turn") and not in_qa(room):
        start_qa(state, now)
    else:
        finish_phase(state, now)


def all_submitted(state: dict) -> bool:
    phase = state["room"]["phase"]
    if phase == "role":
        return all("role" in p["submitted"] for p in state["participants"].values())
    # Votes can change until the timer ends. Speaking ends on the timer, when the speaker finishes or when the teacher moves on.
    return False


def advance_if_needed(state: dict, now: int, expected_version: int | None = None) -> bool:
    room = state["room"]
    if expected_version is not None and expected_version != room["phaseVersion"]:
        return False
    if room.get("paused") or room["phase"] not in TIMED_PHASES:
        return False
    deadline = room.get("phaseEndsAt")
    if (deadline is not None and now >= deadline) or all_submitted(state):
        # One transition per transaction. The next deadline starts from now, so a phase
        # never gets skipped while everybody was offline.
        transition(state, now)
        return True
    return False


def snapshot(state: dict, uid: str) -> dict:
    role = viewer(state, uid)
    response = {
        "viewer": role,
        "room": copy.deepcopy(state["room"]),
        "participants": [copy.deepcopy(state["participants"][u]) for u in seated(state)],
        "rounds": copy.deepcopy(state["rounds"]),
        "serverNow": now_ms(),
    }
    if role == "host":
        response["host"] = copy.deepcopy(state["host"])
    else:
        response["me"] = {"uid": uid, **copy.deepcopy(state["privatePlayers"][uid])}
    return response
