"""Vote tally and reveal. Ties stay ties: no winner is invented."""


def build_reveal(state: dict) -> dict:
    k = state["room"]["settings"]["switcherCount"]
    uids = list(state["participants"])
    switchers = [uid for uid in uids if state["privatePlayers"][uid].get("isSwitcher")]
    tally = {uid: 0 for uid in uids}
    for targets in state["votes"].values():
        for target in targets:
            tally[target] += 1
    counts = sorted(tally.values(), reverse=True)
    boundary = counts[k - 1] if len(counts) >= k else 0
    above = [uid for uid in uids if tally[uid] > boundary]
    at = [uid for uid in uids if tally[uid] == boundary]
    if boundary > 0 and len(above) + len(at) == k:
        top_voted, tied_uids = above + at, []
    else:
        # The k-th place is shared (or nobody received enough votes): report the tie as is.
        top_voted, tied_uids = above, (at if boundary > 0 else [])
    tie = len(top_voted) < k
    caught = [uid for uid in switchers if uid in top_voted]
    if not state["votes"]:
        outcome = "no_votes"
    elif tie:
        outcome = "tie"
    elif len(caught) == k:
        outcome = "found"
    elif caught:
        outcome = "partial"
    else:
        outcome = "missed"
    ballots = []
    for uid in sorted(uids, key=lambda u: state["participants"][u]["seat"]):
        targets = state["votes"].get(uid)
        ballots.append({"uid": uid, "voted": targets is not None, "targets": targets or [], "correct": sum(t in switchers for t in targets or [])})
    return {
        "switcherCount": k,
        "switchers": [{"uid": uid, "roleId": state["privatePlayers"][uid]["roleId"]} for uid in switchers],
        "tally": sorted(({"uid": uid, "votes": tally[uid]} for uid in uids), key=lambda row: -row["votes"]),
        "topVoted": top_voted, "tiedUids": tied_uids, "tie": tie, "outcome": outcome, "ballots": ballots,
    }
