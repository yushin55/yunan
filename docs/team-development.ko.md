# YUNAN 팀 개발환경

2026-11-04. 실제 Firebase 프로젝트는 `whose-side-data-cloud`, 웹 앱은 기존 `carax`, Firestore는 Standard / `(default)` / 서울 `asia-northeast3`다. Firebase 연결과 로컬 백엔드 통합은 검증했으며, 팀 공용 HTTPS 서버와 운영 AI는 아직 준비되지 않았다.

## 코드와 도구

아래 명령은 담당자가 검토한 기능 브랜치를 push한 뒤 새 폴더에서 실행한다. 기존 팀원 작업 폴더를 reset하거나 덮어쓰지 않는다.

```powershell
git clone https://github.com/yushin55/yunan.git yunan-team
cd yunan-team
git fetch origin
git switch --track origin/firebase/production-preparation
```

Node 24.x(검증 24.22.1), Python 3.12(검증 3.12.14)를 권장한다. Python 허용 범위는 3.11 이상 3.14 미만이다. Emulator 실행자는 Java 21 이상을 준비한다. 실제 백엔드 담당자만 Google Cloud CLI와 프로젝트 권한이 필요하다.

```powershell
# 저장소 루트
npm ci
npm --prefix frontend ci
py -3.12 -m venv backend/.venv
& .\backend\.venv\Scripts\python.exe -m pip install -e './backend[test]'
```

## 담당자별 권한

| 담당 | 필요한 것 |
|---|---|
| Emulator 개발 | 로컬 demo 설정. Firebase IAM 불필요 |
| 프런트와 승인된 공용 API 사용 | Web Config와 API 주소. 관리자 JSON/ADC 불필요 |
| 실제 로컬 백엔드 개발 | 본인 ADC와 승인된 최소 Firestore IAM |
| Console Config 조회 | 필요한 프로젝트/앱 조회 권한 또는 담당자가 제공하는 Web Config |
| 규칙 배포·IAM·실제 데이터 정리 | 별도 관리 담당자와 작업별 승인 |

Firebase Web Config는 브라우저용 프로젝트 식별 설정이며 관리자 인증정보가 아니다. 그래도 실제 .env는 Git에 올리지 않는다. 서버 Admin SDK는 클라이언트 보안 규칙을 우회하므로 관리자 권한을 모든 팀원에게 나누지 않는다. 개인 ADC와 서비스 계정 JSON은 서로 복사하지 않는다.

## 실제 Firebase 환경

Console → 프로젝트 설정 → 일반 → 내 앱 → carax → SDK 설정 및 구성에서 값을 확인하거나 담당자에게 Web Config를 받는다. 새 웹 앱을 만들지 않는다. `frontend/.env.local`:

```dotenv
VITE_FIREBASE_API_KEY=<carax apiKey>
VITE_FIREBASE_AUTH_DOMAIN=<carax authDomain>
VITE_FIREBASE_PROJECT_ID=whose-side-data-cloud
VITE_FIREBASE_APP_ID=<carax appId>
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_FIREBASE_EMULATORS=false
```

공용 서버가 생기면 VITE_API_BASE_URL을 담당자가 전달한 실제 HTTPS origin으로 바꾼다. 끝에 `/`를 붙이지 않는다. localhost는 각자 PC를 뜻하며 원격 팀 공용 주소가 아니다. Vite process/mode 환경 변수도 값을 덮어쓸 수 있으므로 변경 후 개발 서버를 재시작한다.

실제 로컬 백엔드 담당자는 본인 Google 계정으로 ADC를 구성한다. Firebase CLI login과 별개의 인증이다.

```powershell
gcloud auth application-default login
```

기본 ADC를 쓰면 GOOGLE_APPLICATION_CREDENTIALS는 비운다. 승인된 impersonation을 사용할 경우 대상 서비스 계정과 Token Creator 등 필요한 권한을 먼저 검토한다. Owner/Editor를 일괄 부여하지 않는다. 아래 `backend/.env`는 **로컬 개발용**이다.

```dotenv
FIREBASE_PROJECT_ID=whose-side-data-cloud
FIREBASE_SERVICE_ACCOUNT_JSON_BASE64=
GOOGLE_APPLICATION_CREDENTIALS=
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ENVIRONMENT=development
MODERATION_MODE=rules
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

백엔드는 backend/.env만 자동 로드한다. .env.production은 자동 로드되지 않는다. 실제 프로젝트에서는 FIRESTORE_EMULATOR_HOST와 FIREBASE_AUTH_EMULATOR_HOST를 파일/셸/IDE에서 제거한다. 관리자·Gemini 비밀값에는 VITE_를 붙이지 않는다.

```powershell
# backend 폴더, 별도 창
Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST -ErrorAction SilentlyContinue
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

```powershell
# frontend 폴더, 별도 창
npm run dev -- --host 127.0.0.1
```

실제 project의 익명 공급자는 켜져 있다. 방을 만든 익명 UID가 해당 방 교사다. 다른 브라우저/기기로 바꾸면 같은 교사 계정을 자동 복구하지 못할 수 있다. 코드 배포와 별개로 운영 교사 인증 정책을 결정해야 한다.

## 읽기 전용 연결 확인

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:8000/api/topics
```

이는 API 실행 확인이며 DB 인증 성공까지 보장하지 않는다. backend 폴더에서 아래 명령은 토큰을 출력하지 않고 실제 DB 메타데이터만 읽는다.

```powershell
@'
from app.core.firebase import firebase_app, validate_environment
from google.cloud import firestore_admin_v1
validate_environment()
app = firebase_app()
assert app.project_id == 'whose-side-data-cloud'
app.credential.get_access_token()
client = firestore_admin_v1.FirestoreAdminClient(credentials=app.credential.get_credential())
db = client.get_database(name='projects/whose-side-data-cloud/databases/(default)', timeout=20)
print('Admin authentication OK; DB:', db.location_id)
'@ | & .\.venv\Scripts\python.exe -
```

브라우저의 방 생성·입장과 signInAnonymously는 실제 계정/문서를 만들 수 있다. 단순 초기화나 읽기 전용 확인과 구분하고 승인된 실제 테스트에서만 실행한다.

## 일상 개발과 회귀는 Emulator

각 창에서 demo 설정을 명시한다. 실제 자격 증명 값이 backend/.env에 남아 있으면 별도 Emulator 작업 폴더/설정을 사용한다. 혼합 환경 오류를 우회하지 않는다.

```powershell
# 창 1, 저장소 루트
java -version
npx firebase emulators:start --project demo-yunan --only auth,firestore
```

```powershell
# 창 2, backend 폴더
$env:FIREBASE_PROJECT_ID='demo-yunan'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIREBASE_SERVICE_ACCOUNT_JSON_BASE64=''
$env:GOOGLE_APPLICATION_CREDENTIALS=''
$env:ENVIRONMENT='development'
$env:MODERATION_MODE='rules'
$env:GEMINI_API_KEY=''
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

```powershell
# 창 3, frontend 폴더
$env:VITE_FIREBASE_PROJECT_ID='demo-yunan'
$env:VITE_FIREBASE_API_KEY='demo-key'
$env:VITE_FIREBASE_AUTH_DOMAIN='demo-yunan.firebaseapp.com'
$env:VITE_FIREBASE_APP_ID='demo-app'
$env:VITE_API_BASE_URL='http://localhost:8000'
$env:VITE_USE_FIREBASE_EMULATORS='true'
npm run dev -- --host 127.0.0.1
```

백엔드 회귀는 창 2와 동일한 demo 변수를 둔 새 창에서 실행한다.

```powershell
# backend 폴더
$env:RUN_EMULATOR_TESTS='1'
& .\.venv\Scripts\python.exe -m pytest -q
```

```powershell
# 저장소 루트, 위 Emulator/API가 실행 중일 때
node --test tests/firebase-config.test.mjs tests/message-request.test.mjs tests/firestore.rules.test.mjs tests/emulator-smoke.test.mjs
```

실제 모드로 돌아갈 때는 demo 셸을 닫고 새 셸에서 실제 .env를 읽힌다. production에서 Emulator를 켜거나 MODERATION_MODE=rules로 운영 검사를 우회하지 않는다. 미성년 학생 운영은 `MODERATION_MODE=teacher_review`, `GEMINI_API_KEY=`로 외부 AI 호출을 끈다. 명백한 욕설은 차단되고 나머지 모든 발언은 교사 승인 후 공개된다. 교사가 검토를 진행할 수업 절차와 호스팅을 검증해야 한다. 기존 ai 모드는 제공자의 이용 대상·약관을 별도로 확인한 경우에만 검토한다.

## 테스트 데이터와 비용

일반 개발은 demo를 사용한다. 실제 테스트는 담당자가 계정·방·문서 수/기간/삭제 범위를 먼저 승인한다. 신규 UID·방 ID를 비공개 manifest로 추적하고 소유자/경로를 확인한 생성분만 정리한다. 실제 사용자 정보·토큰·원문을 공유 로그에 남기거나 컬렉션 전체를 삭제하지 않는다.

Spark 한도는 프로젝트 전체 팀원이 공유한다. Console → Firestore → (default) → 사용량에서 읽기/쓰기/삭제/저장량을 확인한다. Spark 무료 DB가 Python 서버 호스팅과 Gemini 비용까지 포함하지는 않는다. PITR/TTL/백업·유료 API·결제 연결은 별도 승인 전 활성화하지 않는다.

## 오류 확인

| 증상 | 확인 |
|---|---|
| 원격 기능 브랜치 없음 | 아직 공유 전. 담당자에게 승인된 코드 전달 요청 |
| DefaultCredentialsError | 본인 ADC, 잘못된 GOOGLE_APPLICATION_CREDENTIALS, CLI 인증과 혼동 여부 |
| 401 | Firebase ID 토큰과 프로젝트. 토큰을 채팅에 보내지 않음 |
| 403 | 방 참가·교사/학생 권한과 서버 IAM을 구분 |
| permission-denied | 해당 방 소속·배포 규칙. 전체 허용 규칙으로 해결하지 않음 |
| CORS | 실제 프런트 origin과 ALLOWED_ORIGINS 일치 후 서버 재시작 |
| Emulator 혼합 | demo/실제 project와 두 HOST 및 자격 증명 설정 확인 |
| production/rules 거부 | 정상 보호 장치. 학생 운영은 teacher_review 사용 |
| 첫 요청 타임아웃 | 서버/네트워크/호스팅 절전 확인, 새 방/계정을 반복 생성하지 않음 |

공유 전 `git status`, staged diff와 `git check-ignore frontend/.env.local backend/.env`를 확인한다. 실제 .env/ADC/서비스 계정/Gemini/브라우저 토큰은 Git과 팀 채팅에 넣지 않는다.
