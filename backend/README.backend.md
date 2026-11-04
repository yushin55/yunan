# 브릿지 API

## 채팅 재시도 및 검토 수정

`statement`/`messages` 요청에는 선택적인 `requestId`, `replacesId`를 사용할 수 있습니다. 두 값은 기존 ShortId 형식(영문·숫자·밑줄·하이픈, 1~128자)입니다. 새 프런트는 전송마다 requestId를 만들고, 응답 유실 후 같은 내용의 재시도에는 같은 값을 유지합니다.

서버는 방/학생별 최근 64개 요청 결과와 본문 해시를 내부 상태에 저장합니다. 같은 ID·내용은 새 메시지 없이 기존 결과를 반환하고 같은 ID·다른 내용은 409로 거부합니다. 요청 ID 없는 구버전 클라이언트나 64개 보관 범위 밖의 요청은 중복 방지 보장이 없습니다. 프런트의 미확인 요청 ID는 메모리에 있으므로 새로고침 후 수동 재전송까지 동일 ID를 보장하지는 않습니다.

`replacesId`는 자기 자신의 같은 단계·발언 종류의 검토/차단/반려 메시지만 수정합니다. 수정이 먼저 저장되면 이전 검토는 withdrawn이 되고 승인은 거부됩니다. 승인이 먼저 저장되면 수정이 409가 됩니다. 별개의 새 발언은 이전 발언을 자동 취소하지 않습니다.

BLOCK(flagged)은 교사도 강제로 공개할 수 없습니다. REVIEW(pending_review)만 승인 후 공개됩니다. 종료된 방의 새 발언과 검토 승인은 409로 거부합니다. 이전 성공 요청의 재시도는 저장 없이 기존 결과를 반환할 수 있습니다. 검토 원문은 기존 교사 문서·작성자 알림·서버 내부 문서에만 남고 공개 문서에는 승인된 원문만 들어갑니다. 정규화 문자열·요청 결과 캐시는 공개하지 않습니다.

중복 방지는 원자적인 저장을 보호하며 동시에 시작한 검사/AI 호출 자체를 하나로 합치는 분산 잠금은 아닙니다. 실제 AI 호출·실서비스 권한 검증은 별도 단계입니다.

FastAPI + Firebase Admin SDK + Firestore. Vercel 서버리스 함수로 동작하며, 서버 프로세스에 게임 상태나 타이머를 두지 않습니다. 방마다 `rooms/{id}/internal/state` 문서 하나가 트랜잭션 경계이고, 클라이언트가 읽는 문서는 모두 그 상태에서 만든 투영(projection)입니다. `MemoryRoomRepository`는 단위 테스트에서만 씁니다.

로컬 실행·배포 절차는 [루트 README](../README.md)를 보세요.

## 인증과 권한

- 브라우저는 Firebase 익명 로그인 후 `Authorization: Bearer <ID token>`을 보냅니다. 서버가 Admin SDK로 검증합니다.
- 방을 만든 계정이 **교사(host)** 입니다. 교사는 학생으로 입장할 수 없습니다.
- 교사 전용 액션을 학생이 호출하면 403, 학생 액션을 교사가 호출해도 403입니다.
- 클라이언트의 Firestore 쓰기는 보안 규칙에서 모두 거부합니다. Admin SDK는 규칙을 우회하므로 서버가 따로 권한·단계·입력을 검사합니다.

## API

| 메서드·경로 | 누가 | 설명 |
| --- | --- | --- |
| `GET /api/topics` | 누구나 | 주제 6개(사건 카드·교사 안내 제외)와 게임 설정 |
| `POST /api/rooms` | 교사 | `{topicId}` 또는 `{randomTopic: true}`, 선택 `switcherCount`, `phaseSeconds` |
| `POST /api/rooms/join` | 학생 | `{nickname, code}` — 대기실에서만 새로 입장, 이후는 같은 계정만 재접속 |
| `GET /api/rooms/{id}/me` | 둘 다 | 보는 사람에 맞춘 스냅샷 (`viewer: host`면 `host`, 학생이면 `me`) |
| `POST /api/rooms/{id}/sync` | 둘 다 | 마감 시간이 지났으면 다음 단계로 (`phaseVersion`으로 중복 방지) |
| `POST .../settings` | 교사 | 대기실에서 주제·무작위·역할 전환자 수·단계 시간 변경 (주제를 바꾸면 선호 초기화) |
| `POST .../kick` | 교사 | 대기실에서 학생 내보내기 |
| `POST .../start` | 교사 | 6~8명·전원 선호 완료 시 역할 배정 후 시작 (재시도해도 재추첨 없음) |
| `POST .../pause`, `resume`, `extend`, `next`, `end` | 교사 | 일시정지·재개·연장(10~300초)·다음 단계·종료 |
| `POST .../review` | 교사 | `{entryId, decision: approve|return}` — 확인 대기·걸린 메시지 처리 |
| `POST .../preferences` | 학생 | `{first, second}` (서로 달라야 함, 대기실에서만, 바꾸기 가능) |
| `POST .../confirm-role` | 학생 | 비밀 역할 확인 |
| `POST .../statement` | 학생 | `{text}` 입장 발표 (중재 후 단계 종료 때 일괄 공개) |
| `POST .../messages` | 학생 | `{kind, text, targetUid?}` — 사건 단계 `response/question/answer`, 반론 단계 `rebuttal/question/answer` |
| `POST .../vote` | 학생 | `{targets}` — 역할 전환자 수만큼 서로 다른 후보, 자기 자신 불가, 변경 불가 |

`statement`·`messages` 응답에는 `moderation: {status: published|needs_edit|pending_review, hint, excerpt}`가 들어갑니다.

## 데이터

```text
rooms/{roomId}                    room: 단계·타이머·설정·공개 주제·(사건 단계부터) 사건 카드
  participants/{uid}              닉네임·자리·prefsDone·submitted·(역할 확인 뒤) roleId
  publicRounds/statements         {items: [{uid, text | timedOut}]}  자리 순서
  publicRounds/chat               {items: [{id, uid, phase, kind, text, targetUid}]}
  publicRounds/reveal             투표 뒤: switchers, tally, topVoted, tiedUids, tie, outcome, ballots
  privatePlayers/{uid}            preferences, roleId, isSwitcher, preferenceRank, vote, notices
  host/state                      moderation 기록, teacherGuide
  internal/state                  전체 상태 (votes, statements, eventCard, assignment 감사 기록, rate)
roomCodes/{sha256(code)}          방 코드 → roomId
userLimits/{uid}                  방 생성 횟수 제한
```

`internal/state.assignment`에는 최다 선택 역할과 동률 역할이 감사용으로 남지만 어느 클라이언트 문서에도 복사되지 않습니다.

## 중재

`MODERATION_MODE=teacher_review`: 외부 AI 호출 없이 규칙을 검사하고, 차단되지 않은 모든 발언도 교사 승인 전까지 비공개로 보류합니다. 정상 문장·정치인 이름을 BLOCK하는 것이 아니라 수동 검토하는 운영 모드이며 미성년 학생용 배포에는 이 모드를 사용합니다. 명백한 BLOCK은 교사도 강제 공개할 수 없고 검사 오류도 자동 공개하지 않습니다. `GEMINI_API_KEY`는 비워 둡니다.

`MODERATION_MODE=ai`(기존 기본값): 규칙 검사 → Gemini 판정(실패 시 1회 재시도) → 그래도 실패하면 교사 확인 대기. 사용 대상과 제공자 약관·데이터 처리 조건을 먼저 확인해야 합니다. `MODERATION_MODE=rules`: 규칙 검사만 사용하며 `ENVIRONMENT=production`에서는 계속 서버가 시작을 거부합니다. 안내 문구는 서버의 고정 문구이며 원문을 임의 변경하지 않습니다.

## 환경 변수

| 이름 | 로컬(Emulator) | 운영 |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `production` |
| `FIREBASE_PROJECT_ID` | `demo-yunan` | 실제 프로젝트 ID |
| `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080` | 설정하지 않음 |
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099` | 설정하지 않음 |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` | 비워 둠 | 서비스 계정 JSON의 Base64 |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 프런트엔드 HTTPS 주소 |
| `GEMINI_API_KEY` | 선택 | AI 중재 키 |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | 선택 |
| `MODERATION_MODE` | `rules`, `ai`, `teacher_review` | 미성년 학생 운영 `teacher_review` |

Base64는 암호화가 아닙니다. 서비스 계정과 AI 키는 서버 환경변수로만 관리합니다.
