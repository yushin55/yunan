import copy

from app.services.scoring import SCORE_RULES, score_game
from test_full_game import complete_game


def test_score_maxima_and_no_political_conversion_bonus(game):
    assert sum(rule["max"] for rule in SCORE_RULES) == 100
    state = complete_game(*game)
    before = score_game(state)
    changed = copy.deepcopy(state)
    for p in changed["privatePlayers"].values():
        p["reflection"]["position"] = "oppose"
        p["reflection"]["share"] = not p["reflection"]["share"]
    after = score_game(changed)
    assert {u: v["total"] for u, v in before.items()} == {u: v["total"] for u, v in after.items()}


def test_non_switcher_can_reach_same_maximum(game):
    state = complete_game(*game)
    regular = next(uid for uid, p in state["privatePlayers"].items() if not p["isSwitcher"])
    switcher = next(uid for uid, p in state["privatePlayers"].items() if p["isSwitcher"])
    for guess in state["guesses"].values():
        guess["targetUid"] = switcher
    for rating in state["ratings"].values():
        rating.update(accuracy=5, respect=5, evidence=5)
    assert score_game(state)[regular]["total"] == 100
