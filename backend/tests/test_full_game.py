from conftest import four_players, start_and_assign


def complete_game(service, clock):
    rid = four_players(service)
    current = start_and_assign(service, clock, rid)
    topic_id = current["room"]["topicId"]
    for i in range(4):
        uid = f"u{i}"
        mine = service.read(rid, uid)
        service.action(rid, uid, "claim", {"text": "절차와 권한의 균형을 함께 고려해야 합니다.", "cardId": mine["me"]["cards"][0]["id"], "cardConnection": "당사자가 설명할 기회를 절차에 포함하자는 제안과 연결됩니다."})
    assert service.read(rid, "u0")["room"]["phase"] == "claim_review"
    service.action(rid, "u1", "react", {"targetUid": "u0", "kind": "convincing"})
    for i in range(4):
        service.action(rid, f"u{i}", "review-done", {})
    assert service.read(rid, "u0")["room"]["phase"] == "scenario"
    option = current["room"]["topic"]["scenario"]["options"][0]["id"]
    for i in range(4):
        service.action(rid, f"u{i}", "scenario", {"optionId": option, "reason": "실행 가능성과 권리를 함께 고려했어요."})
    assert service.read(rid, "u0")["room"]["phase"] == "scenario_review"
    for i in range(4):
        service.action(rid, f"u{i}", "review-done", {})
    for i in range(4):
        service.action(rid, f"u{i}", "question", {"targetUid": f"u{(i+1)%4}", "text": "그 방안에서 소외되는 사람은 어떻게 보호하나요?"})
    for i in range(4):
        service.action(rid, f"u{(i+1)%4}", "answer", {"questionId": f"q_u{i}", "text": "이의제기와 재검토 절차를 마련하겠습니다."})
    for i in range(4):
        service.action(rid, f"u{i}", "guess", {"targetUid": f"u{(i+1)%4}", "reason": "우선 가치의 일관성", "clue": "첫 주장과 사건 대응의 기준이 달라졌어요."})
    reveal = service.read(rid, "u0")
    assert sum(row["isSwitcher"] for row in reveal["rounds"]["reveal"]) == 2
    assert "나만의 실제 의견 1" not in str(reveal)
    for i in range(4):
        service.action(rid, f"u{i}", "rating", {"targetUid": f"u{(i+1)%4}", "accuracy": 5, "respect": 4, "evidence": 5})
    for i in range(4):
        service.action(rid, f"u{i}", "reflection", {"position": "support", "understood": "각자의 우선순위가 다를 수 있다", "disagree": "그럼에도 포괄적인 권한에는 반대한다", "opinion": f"최종 개인 의견 {i}", "share": i == 1})
    result = service.read(rid, "u0")
    assert result["room"]["phase"] == "results"
    assert result["room"]["topicId"] == topic_id
    assert result["me"]["initialPosition"]["reason"] == "나만의 실제 의견 0"
    assert "나만의 실제 의견 1" not in str(result)
    assert "최종 개인 의견 1" in str(result)
    assert "최종 개인 의견 2" not in str(result)
    assert len(result["rounds"]["sharedReflections"]) == 1
    assert all(0 <= p["total"] <= 100 for p in result["results"]["players"])
    assert len(result["results"]["players"]) == 4
    # A new service instance using the same persistent repository restores the room.
    from app.services.game import GameService
    assert GameService(service.repository).read(rid, "u0")["room"]["phase"] == "results"
    return service.repository.read(rid)


def test_four_players_complete_entire_game(game):
    complete_game(*game)
