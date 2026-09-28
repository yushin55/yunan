# 유난 API · Firebase · 배포

Python 3.11 이상, FastAPI, Firebase Admin SDK, Firestore로 구현한 4–6인 게임 서버입니다. 운영 환경에서 메모리 저장소·백그라운드 타이머·Cron을 사용하지 않습니다. `MemoryRoomRepository`는 의존성을 교체하는 단위 테스트에만 사용합니다.

## 로컬 실행 (PowerShell)

저장소 루트에서 Node.js 22 이상 및 Java 21 이상을 준비하고 실행합니다. Firebase 계정이나 서비스 계정 키 없이 `demo-yunan` Emulator 프로젝트로 플레이할 수 있습니다.

```powershell
npm install
npm run emulators
```

별도 터미널에서:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e '.[test]'
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

프론트엔드는 별도 터미널에서 저장소 루트의 `npm run dev`로 실행합니다. 이 서버는 `http://localhost:5173` 및 `http://127.0.0.1:5173`에서 오는 요청을 허용합니다. 서버 상태는 `http://127.0.0.1:8000/health`, OpenAPI 문서는 `/docs`, Emulator UI는 `http://127.0.0.1:4000`입니다. 브라우저 프로필/시크릿 세션을 분리하면 여러 익명 참가자로 접속할 수 있습니다. 동일한 익명 UID로 재접속하면 참가자를 추가하지 않고 기존 상태로 복귀합니다.

## 환경 변수

| 이름 | Emulator | 운영 |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `production` |
| `FIREBASE_PROJECT_ID` | `demo-yunan` | 실제 Firebase 프로젝트 ID |
| `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080` | **설정하지 않음** |
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099` | **설정하지 않음** |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` | 비워 둠 | 서비스 계정 JSON 전체를 Base64로 인코딩한 서버 전용 값 |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 쉼표로 구분한 실제 프론트엔드 HTTPS origin |

Base64는 암호화가 아닙니다. 서비스 계정은 서버 환경 변수로만 관리하고 `VITE_` 변수나 저장소에 넣지 않습니다. `.env` 및 `.venv`는 Git/배포 제외 대상입니다. 운영 모드에서는 Emulator host가 하나라도 있으면 Firebase 초기화를 거부합니다. `.env`보다 이미 설정된 환경 변수가 우선합니다.

## Firebase Console에서 설정할 항목

1. Firebase 프로젝트를 만들고 Firestore 데이터베이스를 생성합니다.
2. Authentication → Sign-in method에서 Anonymous를 활성화합니다.
3. 프론트엔드 Web App을 등록하여 공개 Firebase 설정값을 프론트엔드 환경 변수에 넣습니다. 실제 배포 도메인을 Authentication의 authorized domains에 추가합니다.
4. 서버 전용 서비스 계정 자격 증명을 발급하여 Vercel 백엔드 환경 변수에만 등록합니다. Firestore 읽기/쓰기 권한을 해당 계정에 부여합니다.
5. 저장소 루트에서 `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID`로 규칙을 배포합니다.

브라우저는 Firebase Auth로 로그인하고 서버에 `Authorization: Bearer <Firebase ID token>`을 전송합니다. 서버는 Admin SDK로 토큰의 서명·만료·issuer·audience를 검증합니다. Emulator에서는 SDK의 공식 Emulator 토큰 검증 경로를 사용하며 임의 헤더로 인증을 우회하지 않습니다.

## API 계약

`GET /health`, `GET /api/topics/count`만 비인증 공개 경로입니다. 나머지 모든 경로는 Firebase ID 토큰이 필요하며, 생성/코드 입장을 제외한 동작은 해당 방의 참가자인지도 확인합니다. 방 ID는 32자리 소문자 hex, 초대 코드는 혼동되는 글자를 제외한 6자리 영숫자입니다.

| 경로 | JSON 입력 |
| --- | --- |
| `POST /api/rooms` | `{nickname, previousTopicId?}`; `topicId?`는 development **및** Firestore Emulator에서만 허용 |
| `POST /api/rooms/join` | `{nickname, code}` |
| `GET /api/rooms/{roomId}/me` | 없음 |
| `POST .../ready` | `{ready: boolean}` |
| `POST .../start` | `{}`; 방장만, 4–6명 모두 준비 |
| `POST .../initial-position` | `{position, reason, preferences: [roleId1, roleId2]}` |
| `POST .../claim` | `{text, cardId?, cardConnection?}` |
| `POST .../scenario` | `{optionId, reason, cardId?, cardConnection?}` |
| `POST .../question` | `{targetUid, text}` |
| `POST .../answer` | `{questionId, text}` |
| `POST .../guess` | `{targetUid, reason, clue}` |
| `POST .../rating` | `{targetUid, accuracy, respect, evidence}`; 정수 1–5 |
| `POST .../reflection` | `{position, understood, disagree, opinion, share: boolean}` |
| `POST .../sync` | `{phaseVersion?}`; 본문 생략 가능 |
| `POST .../report` | `{targetUid, reason}`; 판당 최대 3회 |

`position`은 `support`, `conditional_support`, `neutral`, `conditional_oppose`, `oppose`입니다. 초기 입장 API는 대응하는 한국어 라벨도 허용합니다. 닉네임 12자, 초기 이유 140자, 선언 100자, 사건 이유 140자, 질문 100자, 답변 60자, 추리 이유 50자·단서 100자, 카드 연결 140자, 회고 이해/비동의 각각 140자·의견 240자, 신고 240자 제한입니다. 공백만 있는 필수 입력은 거부하며 알 수 없는 필드를 거부하므로 클라이언트에서 점수/역할을 주입할 수 없습니다.

모든 정상 mutation 및 `/me` 응답은 다음 snapshot 형태입니다.

```json
{
  "room": {
    "roomId": "32-character-hex", "code": "ABC234", "hostUid": "uid",
    "phase": "lobby", "phaseVersion": 0, "phaseEndsAt": null,
    "revision": 0, "participantCount": 4, "createdAt": 0, "updatedAt": 0
  },
  "participants": [{"uid":"uid", "nickname":"이름", "ready":true, "submitted":[], "connectedAt":0, "joinedAt":0}],
  "me": {"uid":"uid", "submissions":{}, "ratedTargets":[]},
  "rounds": {"claim":[], "scenario":[], "question":[]},
  "serverNow": 0
}
```

게임 시작 후 `room.topic`, `room.topicId`, `room.topicVersion`을 추가합니다. 방에는 선택된 Topic Pack 전체의 불변 스냅샷을 저장하므로 파일 내용이 배포 사이에 변경되어도 진행 중인 판의 콘텐츠는 바뀌지 않습니다. 역할 배정 후 `me`에 `initialPosition`, `preferences`, `roleId`, `isSwitcher`, `cards`가 생기고, `participants[].roleId`만 공개됩니다. 제출 결과는 `me.submissions`로 본인만 미리 볼 수 있습니다. `ratedTargets`로 새로고침 후 이미 평가한 대상을 확인합니다.

공개 라운드의 항목은 `uid`를 포함합니다. 질문에는 `questionId`, `targetUid`, `text`, 답변 후 `answer`, `answerUid`가 포함됩니다. 정체 공개 후 `rounds.reveal`에 `{uid,roleId,isSwitcher}`, `rounds.guesses`에 추리 결과가 생깁니다. 마지막에는 `results:{players:[공개점수],me:본인결과}`가 추가되고, `rounds.sharedReflections`에는 공유를 선택한 회고만 포함됩니다. `results.me`의 `initialPosition`과 `reflection`은 요청한 본인 것뿐입니다.

같은 제출을 재전송하면 원래 제출을 유지하며 정상 응답합니다. 다른 내용으로 덮어쓰거나 잘못된 단계에 제출하면 `409`입니다. 만료된 단계에 늦은 제출이 도착하면 트랜잭션으로 단계를 먼저 전환해 저장하고 제출은 `409`로 거부합니다. 인증/권한/유효성/횟수 제한은 각각 `401`/`403`/`422`/`429`입니다. 클라이언트는 `409` 뒤 `/me`를 다시 읽어 현재 단계로 복귀할 수 있습니다. Firestore 재시도 횟수를 초과한 경합이나 일시적인 연결 장애는 `Retry-After: 2`와 함께 `503`으로 알립니다.

## 단계, 타이머, 동시성

`lobby → topic(15초) → initial(60초) → role(15초) → claim(45초) → scenario(90초) → question(90초) → guess(45초) → reveal(45초) → reflection(90초) → results`입니다. 전체 제한 시간 합계는 약 9분 55초입니다. 전원 제출 시 해당 단계를 조기 완료합니다. 질문 단계는 전원이 질문하고 모든 질문에 답변했을 때, 평가 단계는 전원이 타인 1명 이상 평가했을 때 조기 종료합니다. `topic`과 `role`은 공개 내용을 읽을 수 있도록 제한 시간 후 넘어갑니다.

서버 시각으로 `phaseEndsAt`을 판정하며 `phaseVersion`을 확인합니다. 여러 참가자가 같은 버전을 `sync`해도 Firestore 트랜잭션 재시도 때문에 정확히 한 번만 전환합니다. 동작 한 번으로 한 단계만 전환하고 다음 제한 시간은 그때부터 부여하므로 장시간 전원이 이탈해도 복귀 즉시 모든 화면이 지나가지 않습니다. 프론트는 마감/복귀 때 sync하며, 접속 확인용 60초 heartbeat를 사용할 수 있습니다. 방장의 마지막 요청이 180초 이상 전이라면 다음으로 활동한 참가자에게 방장 권한을 넘깁니다. 접속 표시는 마지막 활동 기준이며 실시간 네트워크 연결 여부를 확정하지 않습니다.

만료까지 초기 입장을 내지 않으면 `neutral`, 빈 이유, 기본 역할 2개를 `timedOut:true`와 함께 저장합니다. 실제 의견을 만들어내지 않습니다. 주장/사건 미제출은 공개 배열의 `timedOut:true`로 표시하고 참여 점수를 주지 않습니다. 게임 중 새 참가자는 받지 않지만 같은 UID의 재접속은 가능합니다. 로비에서 브라우저를 닫은 참가자의 자리 삭제/강퇴 기능은 제공하지 않습니다. 남은 인원으로 새 방을 만들 수 있습니다.

## Firestore 구조와 보안 경계

| 경로 | 내용 | 클라이언트 읽기 |
| --- | --- | --- |
| `rooms/{roomId}` | 공개 방 상태, pinned topic, phase/version/deadline/revision | 해당 방 참가자 단일 get/subscription |
| `rooms/{roomId}/participants/{uid}` | 닉네임·준비·공개 역할·제출 완료 표시 | 해당 방 참가자 |
| `rooms/{roomId}/privatePlayers/{uid}` | 초기 생각·선호·본인 역할 전환 여부·본인 카드·회고 | 해당 UID 본인 단일 get |
| `rooms/{roomId}/publicRounds/{roundId}` | `{items:[...]}` 형태 공개 라운드 | 해당 방 참가자 |
| `rooms/{roomId}/results/{uid}` | 초기/최종 의견을 포함한 개인 결과 | 해당 UID 본인 단일 get |
| `rooms/{roomId}/internal/state` | 전체 서버 정본: 비공개 제출·추리·평가·신고·횟수 제한 포함 | 전면 금지 |
| `roomCodes/{sha256(code)}` | 방 코드 → roomId | 전면 금지 |
| `userLimits/{uid}` | 시간당 방 생성 횟수 | 전면 금지 |

모든 클라이언트 write를 금지합니다. room 전체 목록 조회나 타인의 privatePlayers/results 목록 조회도 불가합니다. **Admin SDK는 보안 규칙을 우회하므로** API 내부의 토큰, 참가자, 단계, 자기 평가 금지, topic별 역할/카드/선택지 검증이 별도로 필요하며 구현되어 있습니다. 규칙이 서버 검증을 대신하지 않습니다.

권장 모델의 `submissions`, `guesses`, `ratings`를 별도 컬렉션으로 나누는 대신 6인 상한에 맞는 `internal/state` 정본에 저장합니다. 정본과 공개/개인 문서를 **한 트랜잭션**으로 갱신하므로 부분 공개나 이중 전환을 막습니다. 실제 변경된 문서만 쓰고, 이미 완료된 phaseVersion의 sync는 읽기만 수행해 동시 요청의 경합을 줄입니다. 사용자 입력 길이와 인원을 제한하여 Firestore 문서 크기 한도를 고려합니다. `room.revision`은 상태를 수정하는 정상 mutation마다 증가해 ready/답변/평가 변경도 room 구독에 전달됩니다. `topics`는 서버 패키지의 검증된 JSON을 사용하며 게임 시작 전 topic 전문 조회 API는 제공하지 않습니다.

신고는 서버 정본에 보존되는 관리 대상 자료입니다. 자동 제재, 별도의 운영자 신고 대시보드, 콘텐츠 삭제/보존 기간 자동화는 구현하지 않았습니다. 운영 시 접근이 제한된 관리 도구 및 보존 정책을 추가할 수 있습니다.

동시 제출은 정본을 읽은 시점의 Firestore `update_time`을 트랜잭션 쓰기 사전조건으로 사용합니다. 정본이 그사이 바뀌면 정본과 공개/개인 문서의 쓰기 전체가 취소되고 최신 정본에서 다시 계산합니다. 이는 프로세스 잠금 없이 여러 서버 인스턴스에서도 유지되는 낙관적 동시성 제어입니다. SDK 내부 재시도는 1회로 두고, 서버의 한정된 루프가 최대 8회 시도하며 충돌 사이에 짧은 지터를 둡니다. 단계 타이머를 위한 sleep이나 백그라운드 작업은 사용하지 않습니다. 실제로 변경된 문서만 커밋하고, 이미 처리한 phaseVersion의 sync는 쓰지 않습니다.

## 콘텐츠와 점수

`app/content/topics/*.json`을 읽고 역할 4–6개·역할별 카드 3장·사건 선택지·질문·고유 ID 접두사를 검사합니다. 신규 팩은 같은 데이터 구조로 파일을 추가하면 됩니다. 역할은 Topic Pack의 선호 1·2순위 밖에 최소 2명을 배정하며, 나머지는 선호 내 역할을 받습니다. 선호 밖 후보 중 가능한 경우 초기 입장과 다른 stance를 우선합니다. 판단 유보에는 반대 입장이라는 판단을 하지 않습니다.

`app/services/scoring.py`의 `SCORE_RULES`가 결과 `breakdown[].rule` 및 `reason`에 그대로 포함됩니다. 선언 10, 사건 10, 질문/답변 참여 10, 카드 연결 최대 15, 이유 있는 추리 최대 10, 받은 참가자 평가 최대 25, 회고 15, 역할 수행 5로 총 100점입니다. 카드 점수는 유효한 본인 카드+별도 연결 설명 5점과 받은 근거 평가 평균÷5×10점으로 구성합니다. 자동으로 텍스트의 이해 수준을 판단하지 않습니다. 정치적 의견 변경·텍스트 길이·회고 공유 자체에 보너스가 없습니다. 역할 수행 마지막 5점은 전환자/비전환자 모두 나를 전환자로 지목한 사람이 없는 동일 조건입니다. 받은 평가가 없으면 평가 점수 0점과 `평가 없음`을 표시하며, 당사자 평가라고 부르지 않습니다.

## 테스트와 빌드

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe build.py
.\.venv\Scripts\python.exe -m pip wheel --no-deps . --wheel-dir dist
```

Emulator가 실행 중인 상태에서 실제 익명 인증·Firestore 전체 게임 테스트도 실행합니다.

```powershell
$env:RUN_EMULATOR_TESTS='1'
.\.venv\Scripts\python.exe -m pytest -q
```

`.env`를 사용하지 않을 때는 `.env.example`의 Emulator 환경 변수를 프로세스에 설정하세요. 통합 테스트는 실제 Auth Emulator에서 만든 4개 ID 토큰, FastAPI 요청 검증, Firestore 트랜잭션으로 방 생성부터 결과까지 수행합니다. 테스트 시간만 주입하여 10분을 기다리지 않으며 인증/저장소는 모킹하지 않습니다. 4개 동시 sync의 정확히 한 번 전환, 재접속, topic 고정, 최소 2 전환자, 공유 비선택 의견 비공개를 확인합니다. 보안 규칙 테스트는 루트에서 `npm run test:rules`이며 격리된 `demo-yunan-rules` 프로젝트를 사용합니다.

## Vercel 백엔드 프로젝트

현재 공식 [FastAPI on Vercel](https://vercel.com/docs/frameworks/backend/fastapi) 문서(2026-09-26 확인)에 맞춰 `app/main.py`에서 `app`을 export하고 `pyproject.toml`의 `[tool.vercel] entrypoint = "app.main:app"`를 명시했습니다. 별도의 오래된 `api/index.py` 어댑터나 legacy `builds/routes` 설정은 필요하지 않습니다. `[tool.vercel.scripts] build = "python build.py"`는 의존성 설치 후 팩 및 OpenAPI를 검증합니다. `vercel.json`은 해당 entrypoint의 최대 실행 시간을 30초로 설정합니다.

1. 동일 Git 저장소로 **별도의 백엔드 Vercel 프로젝트**를 생성하고 Root Directory를 `backend`로 선택합니다.
2. FastAPI 자동 감지를 사용하고 Build Command는 기본값을 유지합니다. Frontend Output Directory를 `dist`로 지정하지 않습니다.
3. 위 표의 **운영** 환경 변수들을 등록합니다. Preview 환경을 쓰면 해당 Preview 프론트 origin도 허용 목록에 추가합니다.
4. 배포 후 백엔드 `/health`, `/api/topics/count`, `/docs`를 확인합니다.
5. 프론트엔드 Vercel 프로젝트의 `VITE_API_BASE_URL`을 이 API origin으로 설정하고 프론트를 다시 빌드합니다. 프론트의 `VITE_USE_FIREBASE_EMULATORS=false`를 설정합니다.

CLI에서는 `cd backend; npx vercel`로 프로젝트를 연결한 후 `npx vercel build`, `npx vercel --prod`를 실행할 수 있습니다. 실제 클라우드 배포에는 소유한 Vercel/Firebase 계정과 서비스 계정이 필요합니다. 로컬 코드/패키지 빌드 성공과 계정에 연결한 Vercel 클라우드 빌드 성공은 별개로 보고해야 합니다.
