import copy
import time

from fastapi import HTTPException

from app.services.role_assignment import assign_roles
from app.services.scoring import score_game


PHASES = ["lobby", "topic", "initial", "role", "claim", "claim_review", "scenario", "scenario_review", "question", "guess", "reveal", "reflection", "results"]
PHASE_SECONDS = {"topic": 25, "initial": 60, "role": 30, "claim": 45, "claim_review": 40, "scenario": 90, "scenario_review": 45, "question": 90, "guess": 45, "reveal": 120, "reflection": 90}
# After each public round everyone looks over the others' turns and reacts before moving on.
REVIEW_PHASES = {"claim_review": "claim", "scenario_review": "scenario"}


def now_ms():
    return int(time.time() * 1000)


def require_member(state: dict, uid: str):
    if uid not in state["participants"]:
        raise HTTPException(403, "이 방의 참가자만 접근할 수 있어요.")


def transition(state: dict, now: int) -> None:
    room = state["room"]
    phase = room["phase"]
    topic = room.get("topic")
    if phase in ("lobby", "results"):
        return
    if phase == "initial":
        # Timeouts remain visibly unsubmitted and receive a neutral fallback, never a fabricated opinion.
        for uid, private in state["privatePlayers"].items():
            private.setdefault("initialPosition", {"position": "neutral", "reason": "", "preferences": [r["id"] for r in topic["roles"][:2]], "timedOut": True})
        for uid, assigned in assign_roles(topic, state["privatePlayers"]).items():
            state["privatePlayers"][uid].update(assigned)
            state["participants"][uid]["roleId"] = assigned["roleId"]
    if phase in ("claim", "scenario"):
        rows = []
        for uid in state["participants"]:
            row = state["submissions"][phase].get(uid)
            rows.append(copy.deepcopy(row) if row else {"uid": uid, "timedOut": True})
        state["rounds"][phase] = rows
    if phase == "guess":
        state["rounds"]["reveal"] = [{"uid": uid, "roleId": p["roleId"], "isSwitcher": p["isSwitcher"]} for uid, p in state["privatePlayers"].items()]
        state["rounds"]["guesses"] = list(state["guesses"].values())
    if phase == "reflection":
        state["results"] = score_game(state)
        state["rounds"]["sharedReflections"] = [{"uid": uid, **p["reflection"]} for uid, p in state["privatePlayers"].items() if p.get("reflection", {}).get("share") is True]
    next_phase = PHASES[PHASES.index(phase) + 1]
    room.update(phase=next_phase, phaseVersion=room["phaseVersion"] + 1, phaseEndsAt=now + PHASE_SECONDS[next_phase] * 1000 if next_phase in PHASE_SECONDS else None)
    room["updatedAt"] = now


def all_submitted(state: dict) -> bool:
    phase = state["room"]["phase"]
    uids = set(state["participants"])
    if phase == "initial":
        return all("initial" in p["submitted"] for p in state["participants"].values())
    if phase in ("claim", "scenario"):
        return uids <= state["submissions"][phase].keys()
    if phase == "question":
        questions = state["submissions"]["question"]
        return uids <= questions.keys() and all(q.get("answer") for q in questions.values())
    if phase == "guess":
        return uids <= state["guesses"].keys()
    if phase == "reveal":
        return uids <= {row["uid"] for row in state["ratings"].values()}
    if phase == "reflection":
        return all(p.get("reflection") for p in state["privatePlayers"].values())
    if phase in REVIEW_PHASES:
        return all(phase in p["submitted"] for p in state["participants"].values())
    return False


def advance_if_needed(state: dict, now: int, expected_version: int | None = None) -> bool:
    room = state["room"]
    if expected_version is not None and expected_version != room["phaseVersion"]:
        return False
    deadline = room.get("phaseEndsAt")
    if (deadline is not None and now >= deadline) or all_submitted(state):
        # One transition per transaction. The next deadline begins at reconnect time,
        # leaving participants a complete window even after a long absence.
        transition(state, now)
        return True
    return False


def snapshot(state: dict, uid: str) -> dict:
    require_member(state, uid)
    private = copy.deepcopy(state["privatePlayers"][uid])
    private.pop("rateWindow", None)
    private.pop("rateCount", None)
    private.pop("reportCount", None)
    private["uid"] = uid
    private["ratedTargets"] = [rating["targetUid"] for rating in state["ratings"].values() if rating["uid"] == uid]
    if private.get("initialPosition"):
        private["preferences"] = private["initialPosition"]["preferences"]
    private["submissions"] = {phase: copy.deepcopy(rows[uid]) for phase, rows in state["submissions"].items() if uid in rows}
    if uid in state["guesses"]:
        private["guess"] = copy.deepcopy(state["guesses"][uid])
    response = {"room": copy.deepcopy(state["room"]), "participants": list(copy.deepcopy(state["participants"]).values()), "me": private, "rounds": copy.deepcopy(state["rounds"]), "serverNow": now_ms()}
    if state.get("results"):
        public_results = [{k: v for k, v in result.items() if k not in ("initialPosition", "reflection")} for result in state["results"].values()]
        response["results"] = {"players": public_results, "me": copy.deepcopy(state["results"][uid])}
    return response
