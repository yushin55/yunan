from statistics import mean


SCORE_RULES = [
    {"id": "claim", "label": "입장 선언", "max": 10, "rule": "시간 내 입장 선언 제출 10점"},
    {"id": "scenario", "label": "사건 대응", "max": 10, "rule": "선택지와 이유 제출 10점"},
    {"id": "question", "label": "교차 질문 참여", "max": 10, "rule": "질문 또는 답변 제출 10점"},
    {"id": "cards", "label": "관점 카드 연결", "max": 15, "rule": "본인 카드와 연결 설명 제출 5점 + 참가자 근거 활용 평가 평균 ÷ 5 × 10점. 이해 수준을 자동 판정하지 않음"},
    {"id": "guess", "label": "이유 있는 추리", "max": 10, "rule": "이유와 단서 제출 5점 + 전환자를 맞히면 5점"},
    {"id": "rating", "label": "역할 대변 참가자 평가", "max": 25, "rule": "받은 정확성·존중·근거 평가 전체 평균 ÷ 5 × 25점. 평가가 없으면 0점(평가 없음 표시)"},
    {"id": "reflection", "label": "내 진짜 목소리", "max": 15, "rule": "이해한 점·동의하지 않는 점·실제 의견 제출 15점. 의견 변화·공유 여부와 무관"},
    {"id": "role", "label": "설득력 있는 역할 수행", "max": 5, "rule": "나를 전환자로 지목한 사람이 없으면 5점. 전환자와 비전환자 모두 같은 조건"},
]


def score_game(state: dict) -> dict:
    result = {}
    submissions = state["submissions"]
    for uid, participant in state["participants"].items():
        private = state["privatePlayers"][uid]
        ratings = [r for r in state["ratings"].values() if r["targetUid"] == uid]
        average = mean([r[key] for r in ratings for key in ("accuracy", "respect", "evidence")]) if ratings else 0
        evidence = mean(r["evidence"] for r in ratings) if ratings else 0
        cited = any(row.get("cardId") and row.get("cardConnection") for phase in ("claim", "scenario") if (row := submissions[phase].get(uid)))
        guess = state["guesses"].get(uid)
        guess_correct = bool(guess and state["privatePlayers"][guess["targetUid"]].get("isSwitcher"))
        questioned = uid in submissions["question"] or any(q.get("answerUid") == uid for q in submissions["question"].values())
        role_success = not any(g["targetUid"] == uid for g in state["guesses"].values())
        points = {
            "claim": 10 if uid in submissions["claim"] else 0,
            "scenario": 10 if uid in submissions["scenario"] else 0,
            "question": 10 if questioned else 0,
            "cards": round(5 + evidence * 2, 1) if cited else 0,
            "guess": (5 + (5 if guess_correct else 0)) if guess else 0,
            "rating": round(average * 5, 1),
            "reflection": 15 if private.get("reflection") else 0,
            "role": 5 if role_success else 0,
        }
        breakdown = [{**rule, "reason": rule["rule"], "points": points[rule["id"]]} for rule in SCORE_RULES]
        result[uid] = {
            "uid": uid, "nickname": participant["nickname"], "roleId": private["roleId"],
            "isSwitcher": private["isSwitcher"], "total": round(sum(points.values()), 1),
            "breakdown": breakdown, "guessCorrect": guess_correct,
            "ratingCount": len(ratings), "ratingLabel": "참가자 평가" if ratings else "평가 없음",
            "ratingAverage": round(average, 2),
            "initialPosition": private.get("initialPosition"), "reflection": private.get("reflection"),
        }
    return result
