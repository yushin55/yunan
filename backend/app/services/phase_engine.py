"""Phase order, deadlines and per-viewer snapshots.

lobby (topic, rules, role preferences) → role (secret role) → statement → event (event card,
questions and answers) → rebuttal → vote → reveal → ended. Nothing after the reveal asks for
a student's real opinion.
"""
import copy
import time

from fastapi import HTTPException

from app.repositories.topics import load_game_config
from app.services.voting import build_reveal

PHASES = ["lobby", "role", "statement", "event", "rebuttal", "vote", "reveal", "ended"]
TIMED_PHASES = ("role", "statement", "event", "rebuttal", "vote")
CHAT_PHASES = {"event": ("response", "question", "answer"), "rebuttal": ("rebuttal", "question", "answer")}


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


def start_phase(state: dict, phase: str, now: int) -> None:
    room = state["room"]
    seconds = room["settings"]["phaseSeconds"].get(phase) if phase in TIMED_PHASES else None
    room.update(phase=phase, phaseVersion=room["phaseVersion"] + 1, phaseEndsAt=now + seconds * 1000 if seconds else None,
                paused=False, pausedRemainingMs=None, updatedAt=now)
    if phase == "ended":
        room["endedAt"] = now


def transition(state: dict, now: int) -> None:
    room = state["room"]
    phase = room["phase"]
    if phase in ("lobby", "ended"):
        return
    if phase == "role":
        # Roles become public table information; switcher status stays private.
        for uid in state["participants"]:
            state["participants"][uid]["roleId"] = state["privatePlayers"][uid]["roleId"]
    elif phase == "statement":
        rows = []
        for uid in seated(state):
            row = state["statements"].get(uid)
            rows.append(copy.deepcopy(row) if row else {"uid": uid, "timedOut": True})
        state["rounds"]["statements"] = rows
        room["event"] = copy.deepcopy(state["eventCard"])
    elif phase == "vote":
        state["rounds"]["reveal"] = build_reveal(state)
    start_phase(state, PHASES[PHASES.index(phase) + 1], now)


def all_submitted(state: dict) -> bool:
    phase = state["room"]["phase"]
    uids = set(state["participants"])
    if phase == "role":
        return all("role" in p["submitted"] for p in state["participants"].values())
    if phase == "statement":
        return uids <= state["statements"].keys()
    if phase == "vote":
        return uids <= state["votes"].keys()
    # Discussion phases end on the timer or when the teacher moves on.
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
