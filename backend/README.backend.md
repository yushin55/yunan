# 브릿지 API

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

`MODERATION_MODE=ai`(기본): 규칙 검사 → Gemini 판정(실패 시 1회 재시도) → 그래도 실패하면 교사 확인 대기. `MODERATION_MODE=rules`: 규칙 검사만 사용하며 `ENVIRONMENT=production`에서는 서버가 시작을 거부합니다. AI에는 검사할 문장 하나만 보내고, 다른 학생 정보·역할·선호는 보내지 않습니다. 안내 문구는 AI가 아닌 서버의 고정 문구이며, AI가 지목한 고칠 부분은 원문에 실제로 있을 때만 보여 줍니다.

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
| `MODERATION_MODE` | `rules` 또는 `ai` | `ai` |

Base64는 암호화가 아닙니다. 서비스 계정과 AI 키는 서버 환경변수로만 관리합니다.
