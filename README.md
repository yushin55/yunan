# 브릿지 (WHOSE SIDE?) — 역할 추리형 토론 수업

> 학생들이 소외될까 봐 의견을 숨기는 교실에서, 교사는 학생들에게 사회 문제에 대해 자신의 목소리를 내는 역량을 길러 주기 어렵다.

브릿지는 중·고등학교 교사가 사회 문제 토론 수업에 쓰는 웹 게임입니다. **교사가 진행자**, **학생이 참가자**입니다. 학생은 자기 생각을 처음부터 밝히는 대신 **배정받은 역할**을 출발점 삼아 말하고, 비밀 역할·사건 카드·질문·추리·투표로 대화에 참여합니다. AI는 욕설·인신공격을 공개 전에 걸러 교사의 진행을 돕는 데만 씁니다.

- 학생이 고르는 것은 **게임에서 맡고 싶은 역할**입니다. 학생의 실제 정치·사회적 입장으로 저장하거나 표시하지 않습니다.
- 음성·영상 없이 채팅과 화면 조작만으로 한 판이 끝납니다.
- 힌트, 게임 뒤 실제 입장 발표·최종 의견, 점수·평가는 없습니다.

## 혼자 미리 해 보기 (연습 모드)

```powershell
npm --prefix frontend install
npm run dev
```

http://localhost:5173 → **서버 없이 혼자 연습해 보기**를 누르면 API·Firebase 없이 학생 화면으로 한 판을 끝까지 해 볼 수 있습니다. 함께하는 5명은 역할 카드를 바탕으로 말하는 컴퓨터 연습 상대(AI 채팅 아님)이고, 그중 역할 전환자는 일부러 말을 조금 어색하게 해서 추리할 단서를 남깁니다. 선생님 역할(게임 시작·다음 단계)은 화면 위 연습 진행 바로 직접 합니다. 역할 배정·투표·공개 규칙은 실제 서버와 같고, 표현 점검은 간단한 규칙 검사만 합니다. 진행은 이 브라우저의 localStorage에만 저장되어 새로고침해도 이어집니다.

연습 모드는 [frontend/src/data/practiceTopics.json](frontend/src/data/practiceTopics.json)의 주제 사본을 씁니다. 주제 JSON을 고친 뒤에는 `npm run content:sync`로 사본을 갱신하세요(백엔드 테스트가 사본이 원본과 같은지 확인합니다).

## 게임 규칙

| 항목 | 내용 |
| --- | --- |
| 인원 | 학생 6~8명 (교사는 참가자가 아닌 진행자) |
| 주제 | 브릿지가 검토한 6개 중 교사가 선택하거나 무작위 (6개 안에서만) |
| 선호 역할 | 학생마다 서로 다른 1순위·2순위 |
| 역할 전환자 | 기본 1명, 교사가 2명으로 설정 가능 |
| 단계 | 대기실(주제·규칙·선호 역할) → 비밀 역할 확인 → 입장 발표 → 사건 공개·질문과 답변 → 반론 → 역할 전환자 투표 → 정체·투표 결과 공개 → 종료 |

### 역할 전환자 선정·배정 (서버에서만)

[backend/app/services/role_assignment.py](backend/app/services/role_assignment.py)

1. 모든 학생의 1순위를 역할별로 셉니다.
2. 가장 많이 선택된 역할을 고릅니다. 동률이면 동률인 역할 중 서버가 무작위로 고릅니다.
3. 그 역할을 1순위로 고른 학생 중에서 역할 전환자를 무작위로 뽑습니다.
4. 역할 전환자는 **본인의 1·2순위를 모두 제외한** 역할 중 하나를 무작위로 받습니다.
5. 나머지 학생은 **본인의 1순위 또는 2순위**를 받습니다. 한 역할에 몰리지 않도록, 무작위 순서로 돌며 1·2순위 중 현재 배정 인원이 적은 쪽을 받습니다(같으면 1순위).

- 역할 전환자 2명 설정인데 후보가 2명 미만이면 시작하지 않고, 교사에게 1명으로 바꾸라고 안내합니다(어느 역할인지·몇 명인지는 밝히지 않음).
- 비선호 역할이 없거나 역할이 4개 미만이면 시작을 막고 원인을 보여 줍니다.
- 배정은 한 번만 합니다. 시작 재요청·재접속으로 다시 뽑지 않습니다. AI는 배정에 관여하지 않습니다.

### 투표와 공개

- 역할 전환자 수만큼 서로 다른 후보를 고릅니다. 자기 자신은 고를 수 없고, 한 번 낸 표는 바꿀 수 없습니다.
- 공개 화면에는 역할 전환자, 득표, 각자의 추리 결과만 나옵니다. 선호 순위는 공개 후에도 나오지 않습니다.
- 최다 득표가 동률이면 승자를 만들지 않고 **동률**로 표시합니다.

### 시간과 미응답

단계별 기본 시간은 [backend/app/content/game_config.json](backend/app/content/game_config.json)에 있습니다(역할 확인 45초, 입장 발표 150초, 사건·질문 300초, 반론 240초, 투표 90초 — 진행 약 14분). 교사는 대기실에서 단계별 시간을 20~900초로 바꿀 수 있고, 진행 중 일시정지·재개·1분 연장·다음 단계를 쓸 수 있습니다. 시간이 끝나면 미응답 학생을 "시간 안에 발표하지 않음"·"투표하지 않음"으로 남기고 다음 단계로 넘어갑니다. 역할 확인·입장 발표·투표는 모두 내면 바로 넘어가고, 토론 단계는 타이머나 교사 조작으로만 끝납니다.

## 이슈 브리핑 영상 (게임 시작 전)

학생은 대기실에서 **이슈 브리핑 영상 → 게임 규칙 → 역할 고르기** 순서로 진행하며, 브리핑을 끝까지 봐야 다음 단계로 넘어갈 수 있습니다. 영상은 가상의 ‘브릿지 뉴스’ 앵커가 전하는 뉴스 형식(오프닝 타이틀, 앵커, 이슈 그래픽, 하단 자막, 출처 티커, 한국어 음성 내레이션, 전체 화면)이며, 교사 대기실 화면에서도 교실에 함께 틀 수 있습니다.

내용은 주제 JSON의 `briefing`(장면·출처)에서만 가져옵니다. 2026년 10월 기준 실제 보도를 요약하고 장면마다 출처(언론사·날짜·링크)를 붙였으며, 서버가 시작할 때 모든 장면의 출처가 목록에 있는지 검증합니다. AI가 영상 내용을 만들지 않습니다. **수업 전에 출처 기사를 확인해 주세요.** 일부 출처는 날짜 표기가 불분명해 데이터에 `날짜 확인 필요`로 남겨 두었습니다.

### 영상 내레이션 (AI 합성 음성)

브리핑(앵커·리포터 재연)과 게임 규칙 영상(진행자)의 음성은 Gemini TTS로 **미리 만들어 둔 MP3**를 재생합니다(`frontend/public/audio/briefing/`, 목록 `frontend/src/data/briefingAudio.json`). 브라우저에서 AI를 부르지 않으며, 원고와 음성이 다르거나 파일이 없으면 그 장면은 자막만 나옵니다. 원고(주제 JSON의 `briefing`, `frontend/src/data/rulesVideo.json`)를 고친 뒤에는 바뀐 장면만 다시 만듭니다.

```powershell
pip install lameenc
python scripts/generate-briefing-audio.py   # backend/.env 의 GEMINI_API_KEY 사용
```

무료 등급은 TTS 모델마다 하루 요청 수가 적어, 스크립트가 다음 모델로 넘어가며 만들고 남은 장면은 다음 실행 때 채웁니다. 화면 장면(교실·복도·급식실 등)은 실제 사진이 아닌 직접 그린 일러스트이며 ‘이해를 돕기 위한 그림’으로 표시됩니다.

## 주제 6개

[backend/app/content/topics/](backend/app/content/topics/)의 JSON이 유일한 원본이며, 서버가 시작할 때 검증합니다. 프런트엔드는 `GET /api/topics`로 받아 씁니다.

| ID | 주제 | 역할 |
| --- | --- | --- |
| `smartphone_class` | 수업 중 학생의 스마트폰 사용을 제한해야 할까? | 학생회 대표 · 담임 교사 · 학부모 · 정보 교과 교사 · 상담 교사 |
| `ai_homework` | 학교 과제에 생성형 AI 사용을 허용해야 할까? | 과제가 많은 학생 · 국어 교사 · AI 동아리 학생 · 학부모 · 정보보호 담당 교사 |
| `school_cctv` | 학교 내 CCTV 설치 범위를 확대해야 할까? | 학생 대표 · 생활안전 담당 교사 · 학부모 대표 · 개인정보 보호 자문위원 · 시설 관리 담당자 |
| `uniform_choice` | 교복 착용을 학생 자율에 맡겨야 할까? | 생활규정 학생 위원 · 학년 부장 교사 · 학부모 · 교복 업체 대표 · 전학 온 학생 |
| `lunch_waste` | 학교 급식의 잔반을 줄이기 위한 규칙을 도입해야 할까? | 영양 교사 · 환경 동아리 학생 · 식사량이 적은 학생 · 급식실 조리 종사자 · 학생회 복지부장 |
| `youth_transit` | 청소년의 대중교통 요금을 더 지원해야 할까? | 원거리 통학 학생 · 예산 심사 시의원 · 버스 회사 운영자 · 환경 단체 활동가 · 맞벌이 부모 |

주제마다 중립적인 상황 설명, 역할 5개(소개·목표·걱정하는 점), 사건 카드, 질문 예시 6개, 교사용 진행 안내가 있습니다. 역할은 찬성·반대 라벨이 아닌 이해관계자입니다. 모든 상황과 사건은 **가상의 토론 상황**이며 통계·법령 같은 외부 사실을 단정하지 않습니다. AI는 주제나 사실관계를 만들지 않습니다.

주제를 바꾸거나 추가할 때는 같은 스키마로 JSON을 고치고 `backend/.venv/Scripts/python.exe backend/build.py`로 검증하세요(주제는 정확히 6개, 주제마다 역할 4개 이상·사건 카드 1개 이상, 역할·사건 ID는 주제끼리 겹치면 안 됨).

## AI 중재

[backend/app/services/moderation.py](backend/app/services/moderation.py)

입장 발표와 채팅은 다른 학생에게 보이기 전에 서버에서 검사합니다.

1. **규칙 검사** — 분명한 욕설·인신공격만 잡습니다. 오탐을 줄이도록 정밀도 위주로 만들었습니다("음식을 씹다", "폰이 꺼져서", "시발점"은 통과).
2. **AI 검사** (Gemini, 서버에서만 호출) — 욕설·특정인을 향한 인신공격·조롱인지만 판단합니다. 의견 차이와 반론은 막지 않고, 주장의 옳고 그름이나 학생 성향은 판단하지 않으며, 문장을 대신 써 주지 않습니다.
3. 걸리면 **작성자에게만** 고칠 부분과 짧은 안내를 보여 주고 다시 쓰게 합니다. 공개 낙인이나 자동 퇴장은 없습니다.
4. AI가 응답하지 않으면 한 번 재시도한 뒤 **교사 확인 대기**로 둡니다. 검수 없이 자동 공개하지 않습니다. 교사는 "표현 점검 기록"에서 공개하거나 돌려보낼 수 있고, 잘못 걸린 메시지는 "문제없음 · 그대로 공개"할 수 있습니다.

학생에게는 주제 데이터에 있는 질문 예시만 보여 줍니다. AI가 주장문을 써 주거나 정답을 말하지 않습니다.

## 비밀 유지 구조

클라이언트는 Firestore에 쓸 수 없고, 읽을 수 있는 문서도 역할에 따라 다릅니다([firestore.rules](firestore.rules)).

| 문서 | 내용 | 읽기 |
| --- | --- | --- |
| `rooms/{id}` | 주제(사건 카드·교사 안내 제외), 단계, 타이머, 설정, 사건 단계 이후 사건 카드 | 학생·교사 |
| `participants/{uid}` | 닉네임, 자리, 역할 선택 완료 여부, 제출 표시, 역할 확인 뒤 공개된 역할 | 학생·교사 |
| `publicRounds/*` | 공개된 입장 발표, 중재를 통과한 채팅, 투표 후 결과 | 학생·교사 |
| `privatePlayers/{uid}` | 선호 1·2순위, 배정 역할, 역할 전환 여부, 내 표, 중재 안내 | **그 학생만** (교사도 불가) |
| `host/state` | 표현 점검 기록, 교사용 진행 안내 | **교사만** |
| `internal/state` | 전체 상태(투표 전 표 포함) | 서버만 |

- 방을 만든 익명 계정이 교사입니다. 교사용 API는 서버가 이 계정인지 확인하고, 학생용 API는 참가 학생인지 확인합니다.
- 교사 화면에도 학생별 선호 순위·집계·역할 전환 여부는 결과 공개 전까지 나오지 않습니다(프로젝터로 띄워도 안전). 표현 점검 기록은 기본으로 접혀 있습니다.
- 재접속하면 같은 익명 계정으로 서버에 저장된 단계와 역할로 돌아옵니다. 브라우저에는 방 ID만 저장합니다.

## 로컬 실행

필요 환경: Node.js 22.12+, Python 3.11–3.13, Java 21+ (Firebase Emulator).

처음 한 번:

```powershell
npm install
npm --prefix frontend install
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -e './backend[test]'
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

터미널 세 개에서:

```powershell
npm run emulators                                   # 1. Firebase Auth·Firestore Emulator
cd backend; .venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000   # 2. API
npm run dev                                         # 3. 웹 (http://localhost:5173)
```

VS Code에서는 "전체 실행 (에뮬레이터 + 백엔드 + 프론트)" 구성으로 한 번에 띄울 수 있습니다.

교사는 **선생님 → 주제 선택 → 게임 방 만들기**, 학생은 QR이나 **학생 → 방 코드**로 들어옵니다. 같은 브라우저 프로필의 탭은 같은 익명 계정이므로, 혼자 시험할 때는 교사 1개 + 학생 6개의 분리된 브라우저 프로필(또는 시크릿 창)을 쓰세요. 교사 계정으로는 학생 입장이 막혀 있습니다.

`GEMINI_API_KEY` 없이 로컬에서 시험하려면 `backend/.env`에 `MODERATION_MODE=rules`를 두세요(규칙 검사만 사용, 운영 환경에서는 서버가 거부). 키가 있으면 기본값 `ai`로 둡니다. `ai` 모드인데 키가 없거나 AI가 응답하지 않으면 메시지는 교사 확인 뒤에만 공개됩니다.

## 테스트

```powershell
cd backend; .venv/Scripts/python.exe -m pytest -q          # 단위·API 테스트
$env:RUN_EMULATOR_TESTS='1'; .venv/Scripts/python.exe -m pytest -q tests/test_emulator_integration.py   # 실제 Emulator
cd ..; npm run test:rules                                  # Firestore 보안 규칙 (Emulator 필요)
npx playwright install chromium; npm run test:e2e          # 교사 1 + 학생 6 브라우저 전체 플레이 (Emulator·API·웹 필요)
npm run test:practice                                      # 연습 모드 한 판 (웹 서버만 필요)
npm run build                                              # 타입 검사 + 프로덕션 빌드
```

| 테스트 | 확인하는 것 |
| --- | --- |
| `test_role_assignment.py` | 최다 1순위 역할에서만 전환자 선정, 전환자는 1·2순위 밖, 일반 참가자는 1·2순위 중 하나, 동률 무작위, 2명 후보 부족 시 시작 차단과 안내 |
| `test_game_flow.py` | 단계 순서, 주제 6개·무작위, 6~8명·선호 완료 조건, 교사/학생 권한, 재접속 시 역할 유지·재추첨 없음, 시간 종료·미응답, 일시정지, 투표 규칙, 동률, 종료 뒤 실제 입장 단계 없음 |
| `test_privacy.py` | 공유 문서·교사 화면에 선호·전환 여부 없음(공개 전), 공개 후에도 선호 없음, 사건 카드는 사건 단계부터 |
| `test_moderation.py` | 욕설·공격 감지와 오탐 방지, 작성자 전용 안내, AI 실패 시 교사 확인, 자동 퇴장 없음 |
| `test_topics_and_scope.py` | 주제 6개 데이터 완전성·서로 다른 역할/사건, 제거된 기능의 API 없음 |
| `firestore.rules.test.mjs` | 학생은 자기 비공개 문서만, 교사는 학생 비공개 문서 불가·교사 문서만, 모든 쓰기 거부 |
| `ui-practice.mjs` | 서버 없이 연습 한 판 완주(연습 상대의 답변·대응, 표현 점검, 새로고침 후 이어하기), 서버·Firebase 요청 없음 |
| `test_practice_data.py` | 연습용 주제 사본이 원본과 같은지 |
| `ui-multiplayer.mjs` | 데스크톱 교사 + 모바일 학생 6명이 UI로 한 판 완주(중재 안내, 새로고침 복귀, 일시정지, 결과·종료) |

## Vercel 배포

같은 저장소에서 프로젝트 두 개를 만듭니다.

| 항목 | 프런트엔드 | 백엔드 |
| --- | --- | --- |
| Root Directory | `frontend` | `backend` |
| Framework | Vite | FastAPI (자동 감지) |
| Build | `npm run build` | 기본값 (`pyproject.toml`의 `python build.py` hook) |
| 설정 파일 | `frontend/vercel.json` (SPA rewrite) | `backend/vercel.json`, `backend/pyproject.toml` |

**프런트엔드 환경변수** (브라우저 번들에 포함되는 공개 값만)

| 이름 | 값 |
| --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Firebase Web App 설정값 |
| `VITE_API_BASE_URL` | 백엔드 배포 주소 (예: `https://bridge-api.vercel.app`) |
| `VITE_USE_FIREBASE_EMULATORS` | `false` |

**백엔드 환경변수** (서버 전용, `VITE_`에 넣지 말 것)

| 이름 | 값 |
| --- | --- |
| `ENVIRONMENT` | `production` |
| `FIREBASE_PROJECT_ID` | Firebase 프로젝트 ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` | 서비스 계정 JSON 전체를 Base64로 인코딩한 값 |
| `ALLOWED_ORIGINS` | 프런트엔드 주소 (쉼표로 여러 개) |
| `GEMINI_API_KEY` | AI 중재용 키 |
| `GEMINI_MODEL` | 선택, 기본 `gemini-3.5-flash-lite` |
| `MODERATION_MODE` | `ai` (기본값, 운영에서는 `rules` 불가) |

운영에는 `FIRESTORE_EMULATOR_HOST`·`FIREBASE_AUTH_EMULATOR_HOST`를 **넣지 않습니다**(있으면 서버가 시작을 거부).

배포 순서:

1. Firebase 프로젝트 생성 → Firestore 생성 → Authentication에서 **익명 로그인** 사용 → Web App 등록.
2. 보안 규칙 배포: `npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID`
3. Vercel 백엔드 프로젝트 생성·환경변수 등록·배포 → `https://백엔드주소/health`에서 `"moderation": "ai"` 확인.
4. Vercel 프런트엔드 프로젝트 생성·`VITE_API_BASE_URL`에 백엔드 주소 등록·배포.
5. 백엔드 `ALLOWED_ORIGINS`와 Firebase Authentication 승인 도메인에 프런트엔드 주소 추가 → 백엔드 재배포.

자세한 API·데이터 구조는 [backend/README.backend.md](backend/README.backend.md)에 있습니다.

## 파일 구조

```text
frontend/src/
  app/              라우팅
  pages/            홈 · 교사 방 만들기 · 학생 입장 · 방(교사/학생 화면)
  components/       역할 카드 · 사건 카드 · 단계 표시
  features/
    room/           실시간 구독(useRoom) · 방 코드·QR · 재접속용 방 ID
    topics/         주제 6개 선택·무작위
    roles/          선호 역할 1·2순위 · 비밀 역할
    game/           단계 정의 · 타이머 · 입장 발표 목록
    chat/           채팅 · 작성 · 중재 안내
    voting/         투표 · 결과 공개
    practice/       서버 없는 연습 엔진 · 연습 상대 대사
    teacher/        참여 현황 · 표현 점검 기록 · 진행 설정
  lib/              Firebase 클라이언트 · API 호출
  types/            타입
backend/app/
  api/              방 · 게임(교사/학생 액션) · 주제 API
  services/         게임 진행 · 단계 엔진 · 역할 배정 · 투표 · 중재 · AI 클라이언트
  repositories/     Firestore 트랜잭션 · 주제/설정 로딩
  content/          주제 6개 JSON · game_config.json (단계 시간·인원)
  models/           요청 검증
firestore.rules     문서별 읽기 권한 (쓰기는 서버만)
tests/              보안 규칙 · 브라우저 E2E
```
