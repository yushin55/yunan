# Firebase 실제 환경 설정과 팀 인수인계

이번 준비 단계에서는 실제 인증정보 입력, Firebase 연결 시험, 데이터 변경, 규칙 게시, push, 배포를 하지 않습니다. 아래 실행 명령 중 실제 연결 부분은 다음 단계에서 설정과 대상 프로젝트를 확인한 후 사용합니다.

## 환경을 선택하는 방법

| 항목 | Emulator | 로컬에서 실제 Firebase | 향후 운영 서버 |
| --- | --- | --- | --- |
| 프런트 예시 | `frontend/.env.example` | `frontend/.env.production.example` | 같은 production 예시 |
| 프런트 실제 파일 | `frontend/.env.local` 또는 `.env` | `frontend/.env.local` | 호스팅 환경 변수 또는 `.env.production` 빌드 |
| 백엔드 예시 | `backend/.env.example` | `backend/.env.production.example`에서 아래 로컬 값으로 조정 | 같은 production 예시 |
| 백엔드 실제 파일 | `backend/.env` | `backend/.env` | 서버의 환경 변수/Secret 설정 |
| 프로젝트 | `demo-yunan` | 실제 ID | 실제 ID |
| `VITE_USE_FIREBASE_EMULATORS` | `true` | `false` | `false` |
| 백엔드 두 Emulator HOST | 둘 다 설정 | 둘 다 제거 | 둘 다 제거 |
| `ENVIRONMENT` | `development` | `development` | `production` |
| `MODERATION_MODE` | `rules` | `rules` | `ai` |
| 관리자 자격 증명 | 사용하지 않음 | ADC 파일 경로 또는 Base64 | 호스트 ADC, 비밀 파일 마운트 또는 Base64 Secret |

백엔드는 **backend/.env만 자동 로드**합니다. `.env.production.example`은 공유 가능한 참고 자료이며, `.env.production`이라는 이름만으로는 백엔드에 적용되지 않습니다. 프로세스/클라우드에서 이미 설정한 값이 `.env`보다 우선합니다. 프런트 Vite는 `.env`, `.env.local`, 해당 mode 파일을 읽으며 실행 환경 변수가 우선하고 mode별 파일이 일반 파일보다 우선합니다. 두 종류 설정을 동시에 남기지 말고 한 환경만 선택한 뒤 서버를 재시작하세요.

`.env*` 실제 파일은 Git 제외 대상입니다. `*.example`은 공유 가능합니다. 이미 Git에서 추적하던 파일은 ignore만으로 추적 해제되지 않습니다. 서비스 계정 JSON은 파일명에 관계없이 저장소 밖에 보관하세요.

## 환경 변수 전체 표

새 변수명을 만들지 않고 기존 앱 및 Admin SDK가 사용하는 이름을 유지합니다.

| 위치 | 변수 | 실제 환경에서 입력할 내용 |
| --- | --- | --- |
| 프런트 | `VITE_FIREBASE_API_KEY` | 웹 앱의 `apiKey` |
| 프런트 | `VITE_FIREBASE_AUTH_DOMAIN` | 웹 앱의 `authDomain` |
| 프런트 | `VITE_FIREBASE_PROJECT_ID` | 웹 앱의 `projectId` |
| 프런트 | `VITE_FIREBASE_APP_ID` | 웹 앱의 `appId` (앱 닉네임 아님) |
| 프런트 | `VITE_API_BASE_URL` | 백엔드 origin, 로컬은 `http://localhost:8000`. `/api`나 마지막 `/` 없이 |
| 프런트 | `VITE_USE_FIREBASE_EMULATORS` | `false` |
| 백엔드 | `FIREBASE_PROJECT_ID` | 프런트와 같은 프로젝트 ID |
| 백엔드 | `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` | 선택: 서비스 계정 JSON 전체를 Base64로 변환한 비밀값 |
| 백엔드/SDK | `GOOGLE_APPLICATION_CREDENTIALS` | 선택: 저장소 밖/호스트에 마운트된 JSON 파일의 절대 경로 |
| 백엔드 | `ALLOWED_ORIGINS` | 프런트 origin, 복수는 쉼표 구분. 경로나 마지막 `/` 없이 |
| 백엔드 | `ENVIRONMENT` | 로컬 시험은 `development`, 운영은 `production` |
| 백엔드 | `MODERATION_MODE` | 로컬 시험 `rules`, 운영 `ai` |
| 백엔드 | `GEMINI_API_KEY` | 이번 단계는 빈 값. 운영 ai 모드에서 키 없으면 교사 검토 대기 |
| 백엔드 | `GEMINI_MODEL` | 기존 기본값 `gemini-3.5-flash-lite`. 이번 단계에서 모델 호출/사용 가능성 검증 안 함 |
| 백엔드 | `FIRESTORE_EMULATOR_HOST` | 실제 연결에서는 변수 자체를 제거 |
| 백엔드 | `FIREBASE_AUTH_EMULATOR_HOST` | 실제 연결에서는 변수 자체를 제거 |

자격 증명은 한 방법만 고릅니다. Base64가 있으면 코드에서 우선 사용합니다. 호스트 ADC가 있으면 두 자격 증명 변수를 비워둘 수 있습니다. `GOOGLE_APPLICATION_CREDENTIALS`는 SDK의 기존 표준 변수이며 별도 앱 설정 객체에 복사하지 않습니다. Base64는 암호화가 아닙니다.

네 Firebase 웹 값은 브라우저 번들에 들어갑니다. 관리자 JSON/private_key/Base64와 Gemini 키는 서버에만 둡니다. 현재 앱에는 `storageBucket`, `measurementId`, Firestore `databaseURL`이 필요하지 않습니다.

## Firebase Console: 직접 클릭할 순서

1. [Firebase Console](https://console.firebase.google.com/)에 로그인합니다. 기존 팀 프로젝트가 있으면 선택합니다. 없으면 **프로젝트 추가/새 Firebase 프로젝트 만들기**를 눌러 이름과 프로젝트 ID를 정합니다. Analytics는 이번 연결에 필요하지 않으므로 생략할 수 있습니다.
2. 프로젝트 화면의 요금제 표시 또는 **사용량 및 결제 → 세부정보/요금제**에서 **Spark**를 확인합니다. Blaze 업그레이드, 결제 계정 연결, 무료 크레딧 시작은 선택하지 않습니다. 결제 요구 화면이 나오면 중단합니다. Spark는 결제 수단 없이 사용할 수 있습니다. [공식 요금제](https://firebase.google.com/pricing)
3. **프로젝트 개요 옆 톱니바퀴 → 프로젝트 설정 → 일반 → 내 앱 → 웹 아이콘 `</>`**을 누릅니다. 이미 웹 앱이 있으면 해당 앱을 선택합니다. 새로 등록할 때 앱 닉네임을 입력하고 **앱 등록**을 누릅니다. Hosting 설정은 선택하지 않습니다.
4. 같은 웹 앱의 **SDK 설정 및 구성 → 구성(Config)**을 엽니다. `firebaseConfig`에서 `apiKey`, `authDomain`, `projectId`, `appId`를 각각 동일한 이름의 VITE 변수에 복사합니다. 객체 전체를 `.env`에 붙이지 않습니다. `projectId`는 백엔드에도 동일하게 입력합니다.
5. 왼쪽 **Build/빌드 또는 Databases & Storage → Firestore Database → 데이터베이스 만들기**를 누릅니다. **Standard edition**, 기본 데이터베이스 **`(default)`**, Firestore Native API를 선택합니다. 위치는 팀과 확인하여 한국 중심이면 서울 `asia-northeast3` 제공 여부를 확인합니다. 이미 DB가 있으면 새로 만들거나 위치를 바꾸지 않습니다. 시작 보안 규칙은 **프로덕션 모드**를 선택합니다. 이는 유료 요금제 선택이 아닙니다. 이 단계의 기본 규칙은 브라우저 접근을 차단합니다. [공식 생성 안내](https://firebase.google.com/docs/firestore/quickstart)
6. 왼쪽 **Authentication → 시작하기 → 로그인 방법(Sign-in method) → 새 제공업체 추가/익명(Anonymous)**에서 **사용 설정 → 저장**합니다. Google/전화 인증이나 Identity Platform 업그레이드는 필요하지 않습니다. [공식 익명 인증 안내](https://firebase.google.com/docs/auth/web/anonymous-auth)
7. **프로젝트 설정 → 서비스 계정 → Firebase Admin SDK**로 이동합니다. 조직이 제공하는 ADC 인증이 없고 파일 인증이 필요할 때 **새 비공개 키 생성 → 키 생성**으로 JSON을 다운로드합니다. 저장소 밖의 안전한 폴더로 옮기고, JSON 원문을 열어 공유하거나 채팅에 붙이지 않습니다. 조직 정책이 막으면 우회하지 않습니다. 파일 경로를 `GOOGLE_APPLICATION_CREDENTIALS`에 입력합니다. 로컬 경로를 클라우드에 그대로 넣으면 작동하지 않습니다. [공식 Admin SDK 안내](https://firebase.google.com/docs/admin/setup)
8. 최종 확인: 웹/백엔드/서비스 계정 프로젝트 ID 일치, 실제 연결 옵션 `false`, 백엔드 Emulator HOST 두 개 제거, CORS에 정확한 프런트 origin 지정. 실제 값 입력은 이 준비 단계 다음에 수행합니다.

**Firestore 규칙 탭의 게시 버튼은 아직 누르지 마세요.** 대상 프로젝트와 저장소 규칙을 검토하고 별도 승인을 받은 뒤 적용합니다. 앱에서 권한 오류가 난다고 테스트 모드 공개 규칙으로 바꾸지 않습니다.

Authentication의 승인 도메인은 hostname만 사용하며 CORS origin과 다릅니다. 현재 익명 로그인에는 OAuth 리디렉션 제공자가 필요하지 않습니다. 나중에 Google 등 제공자를 추가할 때 개발/운영 hostname도 점검합니다.

## 나중에 로컬 실제 연결을 시험할 때

기존 파일이 있으면 덮어쓰지 말고 백업과 차이를 먼저 확인하세요. 아래는 파일이 없는 경우의 복사 예시입니다.

```powershell
# 저장소 루트, 비공개 파일이 없는 경우에만
Copy-Item frontend/.env.production.example frontend/.env.local
Copy-Item backend/.env.production.example backend/.env
```

직접 편집할 항목:

- 프런트 placeholder 네 개를 Console 값으로 교체, `VITE_API_BASE_URL=http://localhost:8000`.
- 백엔드 실제 프로젝트 ID와 자격 증명 경로를 입력하고 `ENVIRONMENT=development`, `MODERATION_MODE=rules`, `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`로 설정. Gemini 키는 빈 값 유지.
- `.env`뿐 아니라 셸·IDE·클라우드 변수에 남은 두 Emulator HOST도 제거합니다. `.vscode`의 기존 백엔드 실행 항목은 에뮬레이터를 자동 시작하므로 실제 연결 시험에는 사용하지 않습니다.
- `.env`와 키 원문을 출력하는 명령, 터미널에 비밀값을 직접 넣는 명령은 사용하지 않습니다.
- 파일 저장 후 백엔드와 Vite를 재시작합니다. VITE 변수는 빌드 시 반영되므로 운영 설정 변경 후에는 다음 승인된 배포 단계에서 재빌드가 필요합니다.

## 클라우드 작업 환경에 비밀값을 등록하는 방법

1. 클라우드 작업 도구의 해당 프로젝트 **Settings → Secrets/Environment Variables**를 엽니다. 서비스별 메뉴명은 다를 수 있습니다. 이번 단계에서 새 호스팅 서비스 가입/결제/배포는 하지 않습니다.
2. 프런트 빌드 환경과 백엔드 런타임 환경을 별도로 선택합니다. VITE 공개 값은 프런트에, 서비스 계정은 백엔드에만 등록합니다.
3. 백엔드에서 호스트 ADC를 제공하면 이를 우선 사용합니다. 그렇지 않으면 JSON을 비밀 파일로 마운트하고 그 호스트 경로를 `GOOGLE_APPLICATION_CREDENTIALS`에 지정합니다. 파일 마운트가 없다면 기존 `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`를 Secret으로 사용합니다.
4. Base64가 필요하면 신뢰하는 로컬 도구에서 JSON 파일을 읽어 변환하고 출력/외부 변환 사이트 전송 없이 Secret 입력란으로 옮깁니다. 로컬 PowerShell에서 아래처럼 클립보드로 전달할 수 있습니다. 명령에는 실제 키 내용이 들어가지 않습니다.

```powershell
# 직접 로컬에서 실행: 실제 경로로 교체. 키 내용을 터미널에 출력하지 않음.
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\secure-folder\service-account.json')) | Set-Clipboard
# 백엔드 Secret 입력란에 붙여넣고 저장한 뒤 클립보드 비우기
Set-Clipboard -Value ''
```

클립보드 기록·동기화가 켜져 있다면 이 방법 대신 호스트의 비밀 파일 기능을 사용합니다. 키를 공유 문서나 GitHub Secrets 이외의 일반 GitHub 텍스트에 복사하지 않습니다. GitHub Actions를 실제로 도입하는 경우에만 Actions Secrets를 사용하며, 이는 현재 서버 런타임 변수를 자동 설정하는 기능이 아닙니다.

5. 운영/Preview/개발 중 적용 범위를 명시합니다. 실제 운영 키를 모든 브랜치 Preview에 노출하지 않습니다. PR의 임의 코드가 비밀값에 접근하지 않도록 저장소 정책을 확인합니다.
6. 비밀값 저장 여부는 이름과 설정 완료 여부로만 확인하고 전체 환경 변수·키·토큰을 로그에 출력하지 않습니다. `.env`는 업로드하지 않습니다. 권한은 필요한 팀원에게만 부여합니다.

## 검증과 다음 단계

인증정보 없이 가능한 명령(필요한 의존성 설치 후):

```powershell
node --test tests/firebase-config.test.mjs  # Node 22.18+ 또는 현재 검증된 Node 24
npm run build                             # TypeScript 검사 + Vite build
backend/.venv/Scripts/python.exe -m pytest -q -m 'not emulator' backend/tests
```

Emulator 테스트는 Java 21+와 루트 npm 의존성이 필요합니다. 기존 demo 전용 프로젝트에서만 `npm run emulators`, `npm run test:rules`를 사용합니다. 백엔드 통합 테스트는 두 HOST를 로컬 주소로 설정하고 `RUN_EMULATOR_TESTS=1`로 별도 실행합니다. 실제 프로젝트 ID와 키를 넣어 기존 Emulator 테스트를 실행하지 않습니다.

다음 단계의 실제 Firebase 검증은 별도 승인/설정 후: 익명 계정 생성 → 교사 방 생성 → 다른 브라우저 프로필 학생 입장 → Firestore 저장 확인 → 실시간 갱신 → 새로고침/서버 재시작 후 재조회 → 미인증 401·학생 교사 액션 403·타인 비공개 문서 읽기 및 직접 쓰기 거부. 전체 게임은 독립된 학생 계정 6개가 필요합니다.

`/health` 성공과 빌드 성공은 실제 DB 연결 성공을 의미하지 않습니다. 교사는 별도 교직원 계정이 아니라 방을 만든 익명 uid입니다. 브라우저 데이터 삭제/다른 기기에서의 계정 복구 기능은 없습니다.

팀 인수인계 기록: 기준 브랜치/SHA, 프로젝트 ID·DB 위치, 환경별 파일과 비밀값 담당자, 실제 실행한 테스트 결과, 규칙 승인/적용 여부, 남은 실제 연결 검증 항목. 키 원문과 토큰은 기록하지 않습니다.
