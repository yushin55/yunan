# 유난 — 반대편의 변호인

**반대편을 이기지 마라. 반대편이 되어 살아남아라.**

팀 브릿지의 4–6인 관점 전환·소셜 추리 웹 게임입니다. React + Vite + TypeScript, Three.js, FastAPI, Firebase Authentication, Firestore로 구현했습니다.

## 바로 체험하기

Node.js **22.12 이상**에서 저장소 루트에 다음 명령을 실행하세요.

```powershell
npm --prefix frontend install
npm run dev
```

**http://localhost:5173** → **먼저 혼자 연습해 볼래요**를 누르면 서버나 Firebase 계정 없이 전체 게임을 체험할 수 있습니다. 게임에 들어가면 내 캐릭터가 원탁에 앉은 **1인칭 시점**에서 다른 캐릭터들을 마주 봅니다. 연습 캐릭터 3명은 미리 작성된 예시로 참여하며 AI 채팅 상대가 아닙니다. 연습 진행은 이 브라우저의 localStorage에 저장됩니다.

## 구현한 플레이와 3D 연출

- 나무 바닥, 녹색 펠트 원탁, 펜던트 조명, 책장과 창문을 갖춘 실제 3D 라운지
- 내 자리에서 다른 참가자를 마주 보는 1인칭 게임 화면과 테이블 위 행동 카드
- 최대 6명의 서로 다른 블록형 캐릭터, 작은 움직임, 카드와 그림자
- 마우스·터치로 시선을 돌리고 캐릭터를 눌러 선택, 시점 초기화
- 30fps 상한, 화면 밖·백그라운드 렌더 중지, 감소 모션 설정, WebGL 대체 화면
- 익명 닉네임, 방 생성, 6자리 초대 코드와 QR, 준비 상태 실시간 반영
- 주제 공개 → 초기 생각/선호 역할 → 비밀 역할 → 선언 → **입장 공개** → 사건 → **대응 공개** → 질문/답변 → 추리 → 정체 공개/평가 → 진짜 의견 → 결과/다시 플레이
- 제출을 마치면 테이블의 누가 제출했고 누가 아직 생각 중인지 실시간으로 보이며, 그동안 테이블을 둘러보거나 추리 메모를 쓸 수 있습니다. 마감 10초 전부터는 화면 가장자리가 붉게 맥박치고 마지막 5초에는 초침 소리가 납니다.
- 질문·추리·평가 상대는 얼굴과 그 사람이 마지막으로 한 말이 담긴 카드로 고릅니다.
- 입장 공개·대응 공개(각 40·45초)에서는 카메라가 한 사람씩 비추며 그 사람의 발언과 근거 카드를 보여 줍니다. 공감돼요·설득력 있어요·반박하고 싶어요·더 듣고 싶어요 중 하나로 공개 반응을 보내면 다른 참가자 화면에 실시간으로 뜨고, 모두 "다 봤어요"를 누르면 바로 다음 단계로 넘어갑니다. 반응은 점수에 영향을 주지 않습니다.
- 한국어 모바일 UI, 마감 표시, 제출 대기, 오류·재접속, 새로고침 복귀
- 원래 의견은 본인만 확인. 마지막 회고도 공유에 동의한 경우에만 공개
- 단계·역할·점수는 FastAPI에서 검증하고 Firestore 트랜잭션으로 확정

모델·텍스처를 내려받지 않고 Three.js geometry로 장면을 구성합니다. 기존 상용 게임의 캐릭터나 자산은 사용하지 않았습니다. 실시간 음성 채팅·카메라 기능은 없습니다.

처음 입장하면 게임 시작 전에 **GAME RULE 브리핑**이 열립니다. 진행자 내레이션이 10개 장면(테이블과 안건 → 비밀 제출 → 역할 전환자 → 입장 선언과 사건 → 교차 질문 → 추리 → 정체 공개와 평가 → 점수)을 차례로 설명하고, 장면마다 원탁 위에서 카드 배분·질문 화살표·추리 조준 같은 시뮬레이션이 함께 재생됩니다. 음성이 끝나면 다음 장면으로 자동으로 넘어가며(약 2분), 일시정지·이전/다음·건너뛰기를 지원합니다. 한 번 본 뒤에는 로비 카드의 **게임 설명 듣기**로 다시 볼 수 있습니다.

게임 화면에서는 마우스 드래그(휴대전화는 터치 드래그)로 주위를 살펴보고, 상대 캐릭터나 이름표를 눌러 발언에 집중합니다. 선택 단계에 들어서면 **진행 카드가 게임 화면 중앙에 바로 등장**합니다. 카드를 따로 펼치지 않고 화면에 놓인 선택지를 눌러 선택·질문·추리·평가를 진행합니다. 관점 카드·추리 메모·지난 대화는 화면 오른쪽의 테이블 도구에서 열 수 있습니다. 왼쪽의 **테이블의 인물** 목록에는 상대마다 이번 단계 제출 여부, 공개된 역할, 내 표시(의심·보류·신뢰)가 나타납니다. 상대를 누르면 미션 카드가 테이블 아래로 내려가고 카메라가 그 사람 쪽으로 돌아가며, 그 사람의 공개 발언과 내 메모가 담긴 카드가 열립니다. 하단의 **미션 카드 / 테이블 보기** 전환이나 **미션 카드로 돌아가기**로 언제든 돌아오며, 작성 중인 답은 그대로 유지됩니다. 추리 메모는 이 브라우저에만 저장되고 서버로 보내지 않습니다. 실제 의견과 역할 카드 등 비공개 정보는 내 화면에만 나타납니다.

주제와 역할, 정체 공개에는 화면 전체의 연출과 효과음을 사용합니다. 기본 주제와 라운드 안내는 게임에 포함된 **합성 남성 음성**을 게임쇼 진행자처럼 살짝 낮추고 금속성 변조·코러스·짧은 에코를 섞어 재생하며, 새 주제나 파일 로딩 실패 시에는 브라우저의 한국어 음성으로 이어집니다. 로비의 **남성 내레이션 · 배경음 미리 듣기**로 게임 전 출력 상태를 확인할 수 있습니다. 첫 클릭 뒤에는 저음 타격, 현악 리듬, 금관 화성을 직접 합성하는 웅장하고 으스스한 배경음이 흐르며 화면 위 버튼으로 음성과 배경음을 각각 끌 수 있습니다. 음성 모델·프롬프트의 출처와 라이선스는 [AUDIO_CREDITS.md](AUDIO_CREDITS.md)에 적었습니다. 다른 게임의 음악·음성 파일은 사용하지 않았습니다. 선택 단계에서는 타로 카드 문양을 가진 카드 세 장의 앞면이 차례로 화면에 나타납니다. 각 카드를 직접 눌러 선택할 수 있으며 화살표·스와이프로 다른 선택지도 살펴볼 수 있습니다.

## 실제 4–6인 로컬 게임

필요 환경: Node.js 22.12+, Python 3.11–3.13, Java 21+. 이번 작업 환경은 Node 22.19 / Python 3.11.9 / Java 22입니다.

처음 한 번, 저장소 루트에서 설치합니다.

```powershell
npm install
npm --prefix frontend install
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -e './backend[test]'
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

이미 작성한 `.env`가 있으면 덮어쓰지 말고 `.env.example`과 비교하세요. 다음을 터미널 세 개에서 각각 실행합니다.

**터미널 1 — Firebase Emulator**

```powershell
npm run emulators
```

**터미널 2 — API**

```powershell
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**터미널 3 — 웹 게임**

```powershell
npm run dev
```

서로 다른 브라우저 프로필/분리된 시크릿 세션 4개로 접속하고, 한 명이 방을 만들고 나머지는 코드로 입장합니다. 같은 프로필의 여러 탭은 같은 익명 계정이므로 참가자 수가 늘어나지 않습니다. 모두 준비하면 방장이 시작합니다. Firebase 계정이나 유료 클라우드 설정 없이 로컬에서 플레이할 수 있습니다.

| 서비스        | 주소                         |
| ------------- | ---------------------------- |
| 게임          | http://localhost:5173        |
| API 상태      | http://localhost:8000/health |
| API 명세      | http://localhost:8000/docs   |
| Emulator 관리 | http://localhost:4000        |

기본 에뮬레이터는 이 컴퓨터에서만 접근하도록 설정했습니다. 다른 기기의 친구들과 접속하려면 아래 실제 Firebase/Vercel 배포를 사용하세요. 게임 소리는 참여자의 첫 클릭 뒤에 시작되며 게임 화면에서 끌 수 있습니다. 카드식 평가에서 여러 명을 살필 수 있도록 정체 공개·평가 제한 시간은 120초입니다.

## 주제 팩

| 주제                     | 역할 | 관점 카드 |
| ------------------------ | ---: | --------: |
| 가상의 교권보호국 신설   |    6 |        18 |
| 학교 스마트폰 사용 제한  |    6 |        18 |
| 공공장소 CCTV 확대       |    6 |        18 |
| 청년 교통비 지원         |    6 |        18 |
| 학교 과제의 AI 사용 공개 |    6 |        18 |

각 팩에는 별도의 사건, 대응 선택지 4개, 교차 질문 6개가 있습니다. 모든 제안과 사건은 **가상 토론 상황**이며, 출처 검증 없이 외부 사실이나 통계를 단정하지 않습니다. 카드에는 **토론용 관점 카드**라고 표시합니다. `editorial_reviewed`는 편집 검토 상태이며 사실 검증을 뜻하지 않습니다.

새 주제를 추가할 때 `backend/app/content/topics/*.json`에 같은 스키마의 팩을 넣고 아래를 실행하면 됩니다. 실제 게임은 서버의 팩을 사용하며, 연습 모드와 홈의 팩 목록은 동기화된 프론트 데이터를 사용합니다.

```powershell
npm run content:sync
cd backend
.venv/Scripts/python.exe build.py
```

방 생성 시에는 주제를 선택하지 않습니다. **시작 순간 서버가 무작위로 선정**하고 팩 전체와 버전을 방에 저장합니다. 재접속·새로고침·콘텐츠 업데이트로 진행 중 주제가 바뀌지 않습니다. 다시 플레이 시 직전 주제를 피해서 새로 선정합니다.

## 점수와 개인정보

총 100점: 선언 10 / 사건 10 / 질문·답변 10 / 관점 카드 연결 최대 15 / 이유 있는 추리 최대 10 / 받은 참가자 평가 최대 25 / 진짜 의견 15 / 역할 수행 5입니다. 각 계산 규칙은 서버의 `SCORE_RULES`와 결과 화면의 펼침 설명에서 확인합니다.

카드 연결 설명만으로 이해 수준을 자동 판정하지 않습니다. 카드 연결 5점과 참가자의 근거 활용 평가로 최대 10점을 더합니다. 추리 이유·단서 5점과 적중 5점을 합산합니다. 다른 사람에게 받은 평가가 없으면 평가 점수는 0입니다. 정치적 의견 변경이나 공유 동의에는 보너스가 없습니다.

연습 모드는 실제 사람의 평가 및 추리 기반 보너스를 제공하지 않으므로 최대 **60점**입니다. 결과 화면에 그 이유를 표시합니다.

모든 클라이언트의 Firestore 쓰기를 금지하며 FastAPI가 ID 토큰·참가자·단계·입력·횟수를 확인합니다. 다른 참가자의 초기 의견과 선호 역할, 공개 전 제출은 읽을 수 없습니다. **Firebase Admin SDK는 보안 규칙을 우회**하므로 서버 검증도 별도로 수행합니다. 데이터 구조·API·개별 보안 규칙과 서버 권한 차이는 [백엔드 안내](backend/README.backend.md)에 설명했습니다.

## Firebase Console 설정

실제 배포 시에만 필요합니다.

1. Firebase 프로젝트와 Firestore 데이터베이스를 생성합니다.
2. Authentication에서 **Anonymous** 로그인 방법을 활성화합니다.
3. Web App을 등록하고 공개 설정값을 프론트의 `VITE_FIREBASE_*` 변수에 입력합니다. Authentication의 승인 도메인에도 프론트 배포 도메인을 등록합니다.
4. 서버 서비스 계정 정보를 Vercel **백엔드 전용** 환경 변수 `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`에 등록합니다. 프론트 `VITE_` 변수에는 넣지 않습니다.
5. 실제 프로젝트로 규칙을 배포합니다.

```powershell
npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

## Vercel 배포

같은 Git 저장소에서 **프로젝트 두 개**를 만듭니다.

| 항목           | 프론트엔드             | 백엔드                                          |
| -------------- | ---------------------- | ----------------------------------------------- |
| Root Directory | `frontend`             | `backend`                                       |
| Framework      | Vite                   | FastAPI 자동 감지                               |
| Build          | `npm run build`        | 기본값, pyproject의 `python build.py` hook      |
| Output         | `dist`                 | 별도 정적 Output 설정 없음                      |
| 설정 파일      | `frontend/vercel.json` | `backend/vercel.json`, `backend/pyproject.toml` |

프론트에는 `.env.example`의 공개 Firebase 값, `VITE_API_BASE_URL=https://백엔드주소`, **`VITE_USE_FIREBASE_EMULATORS=false`**를 등록합니다. 프론트의 SPA rewrite로 `/join`, `/room/...` 직접 접속과 새로고침을 지원합니다.

백엔드에는 `ENVIRONMENT=production`, `FIREBASE_PROJECT_ID`, 서버 전용 서비스 계정 값, `ALLOWED_ORIGINS=https://프론트주소`를 등록합니다. **운영에는 두 Emulator host 변수를 등록하지 않습니다.** 백엔드 배포 후 API 주소를 프론트에 연결하고 프론트를 재빌드합니다. 상세 절차는 [백엔드 배포 안내](backend/README.backend.md#vercel-백엔드-프로젝트)를 참조하세요.

백엔드 진입점과 빌드 hook은 [Vercel 공식 FastAPI 문서](https://vercel.com/docs/frameworks/backend/fastapi)를 기준으로 구성했습니다. 로컬 프론트 빌드와 Python 패키지 빌드는 검증했습니다. 실제 Vercel 빌드 시도는 계정 인증 단계에서 중단되어 **클라우드 빌드·배포 완료로 확인하지 않았습니다**. 계정 연결 및 실제 배포는 남아 있습니다.

## 검사 명령

```powershell
npm run build
npm run test:rules
npx playwright install chromium
npm run test:immersive
npm run test:cinematic
npm run test:audio
npm run test:briefing
npm run test:ui
npm run test:multiplayer
```

`test:rules`는 실행 중인 Firestore Emulator가 필요합니다. `test:immersive`, `test:cinematic`, `test:audio`, `test:ui`는 웹 서버, `test:multiplayer`는 웹·API·두 Emulator가 필요합니다. 실제 사용자 화면과 네트워크를 통해 플레이하며 인증을 우회하지 않습니다. 화면 캡처는 Git에서 제외된 `artifacts/`에 저장합니다.

```powershell
cd backend
.venv/Scripts/python.exe -m pytest -q
$env:RUN_EMULATOR_TESTS='1'
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe build.py
```

단위/API 테스트는 주제 독립성, 선호 검증, 최소 2명 역할 전환, 마감·중복 전환, 권한, 점수, 전체 게임을 검사합니다. 규칙 테스트 14개는 본인/타인 문서·읽기·쓰기·종료 후 초기 의견 비공개를 검사합니다. 브라우저 연습 테스트는 전체 단계, 새로고침, 점수, 회고 기본 비공개, 모바일 화면을 확인합니다. 연출 테스트는 주제 전체 화면 표시, 로컬 합성 남성 음성 재생·다시 듣기, 별도 펼치기 없이 세 장의 선택 카드 표시·직접 선택, 모바일 화면 맞춤을 확인합니다. 오디오 테스트는 로비 미리 듣기와 음성 파일 실패 시 브라우저 음성 대체 재생을 확인합니다. 실제 4인 브라우저 테스트는 분리된 익명 계정과 실시간 구독, 동시 제출, 질문/답변, 평가·공유·복귀를 확인합니다.

## 확인한 결과 · 2026-09-27

| 검사 | 결과 |
| --- | --- |
| TypeScript + Vite 프로덕션 빌드 | 통과 |
| Python 단위/API + 실제 Emulator 통합 | **22개 통과** |
| Firestore 접근·쓰기 보안 규칙 | **14개 통과** |
| 연습 모드 전체 브라우저 플레이 | 통과, 진행 카드 선택·새로고침·비공개 회고·60점 계산 확인 |
| 주제 연출·음성·배경음 브라우저 검사 | 데스크톱·390px 모바일 통과, 로컬 합성 남성 음성 재생·미리 듣기·브라우저 대체 음성·배경음 합성·음소거 확인 |
| 실제 4인 브라우저 전체 플레이 | **385초 완료**, 모든 단계 동시 제출·질문/답변·평가·공유·복귀 확인 |
| 실제 4인 JavaScript / API 오류 | **0 / 0** |
| 데스크톱·390px 모바일 및 1인칭 3D 조작 | 전체 화면·상대 선택·화면 중앙 선택 카드 조작 캡처 확인, 가로 넘침 없음 |
| Python 콘텐츠 검증 및 wheel 빌드 | 5개 팩·17개 API 경로 확인, 빌드 통과 |

브라우저 검사는 실제 서버 타이머를 기다리고, 전원 제출로 나머지 단계가 조기 완료되는 흐름을 사용했습니다. API 통합 검사는 별도로 시간을 주입하며 모든 입력 단계에서 4개 요청을 동시에 보내 원자적 전환을 검사합니다. 브라우저 결과 JSON은 실행 후 `artifacts/ui-multiplayer-report.json`에 생성됩니다. Vercel 클라우드 배포 결과는 이 로컬 검사에 포함되지 않습니다.

## 파일 구조

```text
frontend/
  src/app/                  라우팅·앱
  src/pages/                홈·방·결과
  src/components/scene/     Three.js 라운지
  src/components/game/      단일 진행 카드·주제 공개 연출
  src/components/common/    모달·아이콘
  src/components/layout/    헤더·오디오
  src/hooks/                실시간 구독·동기화·타이머·게임 음성
  src/lib/                  Firebase·API·연습 엔진
  src/data/                 연습용 주제 팩
  src/types/                공통 TypeScript 모델
  src/styles/               반응형 스타일
  .env.example, vercel.json
backend/
  app/api/                  방·게임·주제 API
  app/core/                 설정·Firebase·토큰 인증
  app/models/               입력 검증
  app/repositories/         Firestore 트랜잭션·주제 로딩
  app/services/             게임 단계·역할·점수·입력 검사
  app/content/topics/       원본 주제 팩 5개
  tests/                    단위·API·실제 Emulator 테스트
  .env.example, pyproject.toml, vercel.json, README.backend.md
tests/                      보안 규칙·브라우저 전체 플레이
scripts/                    콘텐츠 동기화
firebase.json, firestore.rules, firestore.indexes.json
```

## 현재 범위와 남은 운영 작업

- 실제 Firebase/Vercel 계정 설정 및 클라우드 배포는 수행하지 않았습니다.
- 실시간 로비의 강퇴·자리 삭제 기능은 없습니다. 방장은 장시간 미접속 시 활동 중인 참가자로 이전되며, 진행 중 미제출은 마감으로 처리합니다.
- 신고 접수/서버 저장은 구현했으며, 별도의 운영자 대시보드·자동 제재·자료 보존 자동화는 없습니다.
- 주제 팩은 토론용 편집 콘텐츠입니다. 외부 근거 자료를 검증한 통계/법률 정보로 제공하지 않습니다.
- Firebase CLI의 간접 개발 의존성에 moderate 취약점 5건이 남아 있으며 critical/high는 없습니다. 운영 프론트 의존성 감사는 0건입니다. 호환성을 깨는 강제 다운그레이드는 적용하지 않았습니다.
