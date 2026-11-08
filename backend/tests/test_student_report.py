"""AI drafts of each student's evaluation: teacher only, after the reveal, evidence from their own lines."""
import pytest
from fastapi import HTTPException

from app.services.ai import AIUnavailable
from app.services.student_report import build_student_reports
from conftest import TEACHER, to_phase
from test_discussion import in_statement, speak


def talked_and_revealed(service):
    rid, uids = in_statement(service)
    speak(service, rid, "기사에 따르면 30%가 불편을 겪어요. 그래서 바꿔야 합니다")
    service.action(rid, TEACHER, "next", {})
    speak(service, rid, "그 말은 이해해요. 하지만 비용도 봐야 해요")
    to_phase(service, rid, "reveal")
    return rid, uids


def test_reports_are_for_the_teacher_after_the_reveal_only(game):
    service, _ = game
    rid, uids = in_statement(service)
    speak(service, rid, "안전이 먼저입니다")
    with pytest.raises(HTTPException) as early:
        service.student_reports(rid, TEACHER)
    assert early.value.status_code == 409
    to_phase(service, rid, "reveal")
    with pytest.raises(HTTPException) as student:
        service.student_reports(rid, uids[0])
    assert student.value.status_code == 403


def test_the_ai_sees_seats_and_roles_and_evidence_maps_back_to_lines(game):
    service, _ = game
    rid, uids = talked_and_revealed(service)
    seen = {}

    def reporter(topic, lines):
        seen["lines"] = lines
        return [
            {"speaker": 1, "overall": "근거를 들어 말함", "points": [{"criterion": "자료 조사", "comment": "수치를 듦", "evidence": [1]}], "strengths": [{"text": "수치 활용", "evidence": [1]}], "improvements": [], "record": "수치를 근거로 주장함."},
            {"speaker": 2, "overall": "상대를 인정함", "points": [], "strengths": [], "improvements": [{"text": "근거 보강", "evidence": [2]}], "record": ""},
        ]

    service.reporter = reporter
    result = service.student_reports(rid, TEACHER)
    state = service.repository.read(rid)
    lines = state["rounds"]["transcript"]
    assert all(set(l) == {"speaker", "roleId", "phase", "kind", "text"} for l in seen["lines"])  # No uid, nickname or secret.
    assert [l["speaker"] for l in seen["lines"]] == [1, 2]
    first, second = result["reports"]
    assert first["uid"] == uids[0] and second["uid"] == uids[1]
    assert first["points"][0]["evidence"] == [lines[0]["id"]]
    assert second["improvements"][0]["evidence"] == [lines[1]["id"]]
    assert result["source"] == "ai"
    assert "studentReports" not in state["rounds"]  # Not stored: only the teacher's screen keeps a copy.


def test_ai_failure_is_a_503_not_a_crash(game):
    service, _ = game
    rid, _ = talked_and_revealed(service)

    def broken(topic, lines):
        raise AIUnavailable("down")

    service.reporter = broken
    with pytest.raises(HTTPException) as error:
        service.student_reports(rid, TEACHER)
    assert error.value.status_code == 503


TOPIC = {"title": "주제", "roles": [{"id": "a", "name": "학생"}, {"id": "b", "name": "교사"}]}
LINES = [
    {"speaker": 1, "roleId": "a", "phase": "statement", "kind": "statement", "text": "자료에 따르면 30%예요"},
    {"speaker": 2, "roleId": "b", "phase": "statement", "kind": "statement", "text": "저는 반대해요"},
    {"speaker": 1, "roleId": "a", "phase": "rebuttal", "kind": "rebuttal", "text": "이해하지만 다르게 봐요"},
]


def test_evidence_must_be_the_students_own_lines_and_criteria_are_fixed():
    def ai(prompt, timeout, max_tokens):
        assert "[L1] 1번 학생(학생)" in prompt and "[L2] 2번 학생(교사)" in prompt
        return {"students": [
            {"speaker": 1, "overall": "좋음", "points": [{"criterion": "자료 조사", "comment": "수치", "evidence": [1, 2, 99, "3"]}, {"criterion": "엉뚱한 기준", "comment": "x", "evidence": [1]}, {"criterion": "반론 수용", "comment": "인정 후 반론", "evidence": [3]}],
             "strengths": [{"text": "근거", "evidence": [2, 3]}], "improvements": [{"text": "", "evidence": [1]}], "record": "근거를 활용함."},
            {"speaker": 7, "overall": "없는 학생", "points": []},
            {"speaker": 1, "overall": "중복", "points": []},
        ]}

    reports = build_student_reports(TOPIC, LINES, ai_call=ai)
    assert [r["speaker"] for r in reports] == [1]
    r = reports[0]
    assert r["points"] == [{"criterion": "자료 조사", "comment": "수치", "evidence": [1]}, {"criterion": "반론 수용", "comment": "인정 후 반론", "evidence": [3]}]
    assert r["strengths"] == [{"text": "근거", "evidence": [3]}]  # Line 2 is someone else's.
    assert r["improvements"] == []


def test_nothing_usable_means_unavailable():
    with pytest.raises(AIUnavailable):
        build_student_reports(TOPIC, LINES, ai_call=lambda prompt, timeout, max_tokens: {"students": [{"speaker": 1, "overall": "", "points": []}]})
