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
| `POST /api/rooms` | 교사 | `{topicId}` 또는 `{randomTopic: true}`, 선택 `switcherCount`, `phaseSeconds`, `micSeconds` |
| `POST /api/rooms/join` | 학생 | `{nickname, code}` — 대기실에서만 새로 입장, 이후는 같은 계정만 재접속 |
| `GET /api/rooms/{id}/me` | 둘 다 | 보는 사람에 맞춘 스냅샷 (`viewer: host`면 `host`, 학생이면 `me`) |
| `POST /api/rooms/{id}/sync` | 둘 다 | 마감 시간이 지났으면 다음 차례·단계로 (`phaseVersion`으로 중복 방지) |
| `POST .../settings` | 교사 | 대기실에서 주제·무작위·역할 전환자 수·단계 시간·한 번에 말하는 시간(`micSeconds`, 10~120초) 변경 (주제를 바꾸면 선호 초기화) |
| `POST .../kick` | 교사 | 대기실에서 학생 내보내기 |
| `POST .../start` | 교사 | 6~8명·전원 선호 완료 시 역할 배정 후 시작 (재시도해도 재추첨 없음) |
| `POST .../pause`, `resume`, `extend`, `next`, `end` | 교사 | 일시정지(마이크도 꺼짐)·재개·연장(10~300초)·다음 차례(없으면 다음 단계)·종료 |
| `POST .../skip-phase` | 교사 | `{phaseVersion?}` 남은 차례를 건너뛰고 다음 단계로 |
| `POST .../speaker` | 교사 | `{targetUid, phaseVersion?}` 입장 발표에서 그 학생에게 바로 차례를 주고 이후 순서는 이어감 |
| `POST .../speech` | 학생 | `{audio(Base64 WAV), mimeType: "audio/wav", phaseVersion, clip?}` 마이크를 쥔 본인만. 받아써서 그 `phaseVersion`의 발언자·종류로 기록. 음성은 저장하지 않음. 응답 `speech: published\|held\|silent`. 마이크 시간이 끝나고 90초가 지나면 409 |
| `POST .../line-add` | 교사 | `{text, phaseVersion?}` 지금 말하는 사람의 말을 직접 입력(같은 표현 점검을 거침) |
| `POST .../line-edit`, `line-delete` | 교사 | `{lineId, text}` / `{lineId}` 발언 기록 고치기·지우기 |
| `POST .../summary` | 교사 | 기록이 바뀌었을 때만 AI로 토론 정리를 다시 만듦 |
| `POST .../review` | 교사 | `{entryId, decision: approve|return}` — 확인 대기·걸린 발언 처리 |
| `POST .../preferences` | 학생 | `{first, second}` (서로 달라야 함, 대기실에서만, 바꾸기 가능) |
| `POST .../confirm-role` | 학생 | 비밀 역할 확인 |
| `POST .../end-turn` | 학생 | `{phaseVersion?}` 자기 차례 끝내기, 마이크도 꺼짐 (다른 학생이 누르면 아무 일 없음) |
| `POST .../mic-on` | 학생 | `{kind: statement\|question\|rebuttal\|answer}` 방에 하나뿐인 마이크 잡기. 다른 사람이 쥐고 있거나, 입장 발표에서 내 차례가 아니거나, 단계에 맞지 않는 `kind`면 409 |
| `POST .../mic-off` | 학생 | `{phaseVersion?}` 내 마이크 끄기 (차례는 그대로) |
| `POST .../vote` | 학생 | `{targets}` — 역할 전환자 수만큼 서로 다른 후보, 자기 자신 불가, 변경 불가 |

`phaseVersion`은 입장 발표의 차례가 바뀔 때와, 사건·반론에서 누군가 마이크를 잡을 때마다 올라갑니다. `phaseEndsAt`은 입장 발표에서는 현재 차례의 마감, 사건·반론에서는 단계 전체의 마감입니다. `room.floor.endsAt`이 지나면 서버와 화면 모두 마이크가 빈 것으로 봅니다. 늦게 도착한 음성도 녹음 당시의 `phaseVersion`으로 발언자와 종류를 찾습니다(`internal/state.turnLog`).

## 데이터

```text
rooms/{roomId}                    room: 단계·타이머·차례(turn: order, index, uid)·마이크(floor: uid, kind, version, endsAt)·설정·공개 주제·(사건 단계부터) 사건 카드
  participants/{uid}              이름(필드명 nickname)·자리·prefsDone·submitted·(역할 확인 뒤) roleId
  publicRounds/transcript         {items: [{id, uid, phase, kind: statement|question|rebuttal|answer, turn, text, source: voice|typed, at}]}
  publicRounds/summary            {positions: [{roleId, points}], clashes, questions, statements: [{uid, text}], source, revision, at}
  publicRounds/reveal             투표 뒤: switchers, tally, topVoted, tiedUids, tie, outcome, ballots
  privatePlayers/{uid}            preferences, roleId, isSwitcher, preferenceRank, vote
  host/state                      moderation 기록, teacherGuide
  internal/state                  전체 상태 (votes, turnLog, eventCard, assignment 감사 기록, rate)
roomCodes/{sha256(code)}          방 코드 → roomId
userLimits/{uid}                  방 생성 횟수 제한
```

`internal/state.assignment`에는 최다 선택 역할과 동률 역할이 감사용으로 남지만 어느 클라이언트 문서에도 복사되지 않습니다.

## 중재

`MODERATION_MODE=ai`(기본): 규칙 검사 → Gemini 판정(실패 시 1회 재시도) → 그래도 실패하면 교사 확인 대기. `MODERATION_MODE=rules`: 규칙 검사만 사용하며 `ENVIRONMENT=production`에서는 서버가 시작을 거부합니다. AI에는 검사할 문장 하나만 보내고, 다른 학생 정보·역할·선호는 보내지 않습니다. AI가 지목한 문제 부분은 원문에 실제로 있을 때만 교사에게 보여 줍니다.

받아쓰기(`services/discussion.py`)에는 음성 구간 하나만, 토론 정리에는 역할 이름, 자리 번호와 공개된 발언만 보냅니다. 학생 이름·uid·역할 전환 여부·선호는 보내지 않습니다. 카드 요약은 자리 번호로 돌아오고 서버에서 사람과 연결합니다.

## 환경 변수

| 이름 | 로컬(Emulator) | 운영 |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `production` |
| `FIREBASE_PROJECT_ID` | `demo-yunan` | 실제 프로젝트 ID |
| `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080` | 설정하지 않음 |
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099` | 설정하지 않음 |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` | 비워 둠 | 서비스 계정 JSON의 Base64 |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 프런트엔드 HTTPS 주소 |
| `GEMINI_API_KEY` | 선택 | 받아쓰기·표현 점검·토론 정리 키 (없으면 교사 직접 입력으로 진행) |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | 선택 |
| `MODERATION_MODE` | `rules` 또는 `ai` | `ai` |

Base64는 암호화가 아닙니다. 서비스 계정과 AI 키는 서버 환경변수로만 관리합니다.
