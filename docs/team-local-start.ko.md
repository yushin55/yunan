# 팀원 첫 실행: 실제 Firebase를 건드리지 않는 방법

이 문서와 `scripts/team-local.mjs`는 `firebase/production-preparation` 브랜치에서 함께 받는다. PR #2는 main 병합 전 검토용 Draft PR이다.

## 1. 새 폴더에 코드 받기

기존 작업 폴더를 덮어쓰지 말고 PowerShell에서 실행한다.

```powershell
git clone --branch firebase/production-preparation https://github.com/yushin55/yunan.git yunan-team
cd yunan-team
```

Node 24, Python 3.12, Java 21 이상을 설치한다. 관리자 권한이나 시스템 전체 PATH 변경 대신 해당 터미널의 JAVA_HOME/PATH를 지정해도 된다. 다음 명령은 의존성을 다운로드하며 실제 Firebase 계정은 필요 없다.

```powershell
npm ci
npm --prefix frontend ci
py -3.12 -m venv backend/.venv
& .\backend\.venv\Scripts\python.exe -m pip install -e './backend[test]'
node scripts/team-local.mjs check
node scripts/team-local.mjs check-backend
```

두 검사 PASS는 설치 경로·백엔드 설정 검사다. 서비스 실행이나 브라우저 동작을 검증했다는 뜻은 아니다.

## 2. 창 세 개에서 실행

각 PowerShell을 저장소 루트에서 열고 하나씩 실행한다.

```powershell
# 창 1: 시작 메시지에서 Auth 9099, Firestore 8080 준비를 확인
node scripts/team-local.mjs emulators
```

```powershell
# 창 2
node scripts/team-local.mjs backend
```

```powershell
# 창 3
node scripts/team-local.mjs frontend
```

브라우저에서 http://127.0.0.1:5173 을 연다. API 실행 확인은 http://127.0.0.1:8000/health, Emulator UI는 http://127.0.0.1:4000 이다. 교사 창에서 방을 만들고 학생은 별도 브라우저 프로필/시크릿 창으로 입장한다. 같은 브라우저 프로필의 탭들은 인증을 공유할 수 있다.

이 도구는 자식 프로세스에만 `demo-yunan`, Emulator HOST, 규칙 중재 모드를 지정하고 관리자·Gemini 인증을 비운다. 기존 `.env` 파일과 부모 PowerShell 환경은 수정하지 않는다. 기존 실제 `.env`가 있어도 이 실행에서는 지정한 demo 값이 우선한다. 서버는 127.0.0.1에만 바인딩하므로 다른 PC·휴대폰에서는 접근할 수 없다.

멈출 때 세 창에서 Ctrl+C를 누른다. Emulator 자동 데이터 내보내기/재가져오기를 설정하지 않았으므로 종료 후 재시작 시 데이터 유지가 보장되지 않는다. 8080/9099/8000/5173이 사용 중이면 해당 프로그램을 먼저 확인한다. 다른 팀원의 프로세스를 임의로 종료하지 않는다. 처음 Emulator를 실행할 때 바이너리 다운로드에 네트워크가 필요할 수 있다.

## 3. 실제 Firebase 담당자만 진행

일상 UI·중재 개발자는 IAM이나 관리자 키가 필요 없다. 실제 백엔드를 연결할 신뢰된 담당자만 [기존 팀 가이드](team-development.ko.md)의 실제 Firebase 환경 절차를 따른다. demo 실행 도구는 실제 Firebase 모드로 전환하는 기능을 제공하지 않는다.

1. 프로젝트 담당자가 **Google Cloud Console → whose-side-data-cloud 선택 → IAM 및 관리자 → IAM**에서 대상자의 현재 권한을 확인한다. 일반 개발자 전체에게 Owner/Editor를 부여하지 않는다.
2. 읽기만 필요한 사람과 실제 Admin SDK 쓰기 담당자를 구분한다. Cloud Datastore Viewer는 데이터 조회 범위가 넓고 Cloud Datastore User는 데이터 쓰기까지 허용하므로 단순 UI 개발에는 부여하지 않는다. 이 역할은 방별 Firestore Security Rules와 같지 않다. DB 메타데이터 조회 권한은 별도 확인한다.
3. 실제 담당자는 **본인 PC**에서 `gcloud auth application-default login`을 실행한다. 브라우저 인증은 본인만 수행하고 인증 코드·ADC 파일을 보내지 않는다. Firebase CLI 로그인과 ADC는 별개다.
4. 기존 서비스 계정과 impersonation 권한이 이미 준비되어 있다면 장기 JSON 키 대신 `gcloud auth application-default login --impersonate-service-account=<승인된 서비스 계정 이메일>`을 검토한다. 대상 계정 권한과 Token Creator는 별도 검토하며 이 작업에서 생성·부여하지 않는다.
5. Web Config는 **Firebase Console → 프로젝트 설정 → 일반 → 내 앱 → carax → SDK 설정 및 구성**에서 확인한다. `frontend/.env.local`에 저장하고 관리자 인증은 프런트에 넣지 않는다. `VITE_API_BASE_URL`은 로컬 백엔드 주소를 사용한다.
6. 백엔드는 `backend/.env`만 자동 로드한다. 실제 모드에서는 Emulator HOST를 제거하고 프런트/백엔드 프로젝트 ID를 `whose-side-data-cloud`로 맞춘다. 기존 팀 가이드의 메타데이터 읽기 검사부터 실행한다. 방 생성·익명 로그인은 계정/문서를 생성하므로 새로운 테스트 승인을 받은 뒤 진행한다.

현재 누구에게 어떤 IAM을 줄지는 결정되지 않았다. 대상자와 역할이 정해진 후에만 권한 변경안을 검토한다. 사용자 ADC 자체는 단기 토큰만 있는 파일이 아니라 갱신 가능한 인증정보를 포함하므로 공유·커밋하지 않는다. 공용 서버, Gemini 운영 AI와 main 병합도 이 준비에 포함되지 않는다.

공식 참고: [ADC 로컬 인증](https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment), [Firestore IAM](https://firebase.google.com/docs/firestore/security/iam), [Firestore Emulator 연결](https://firebase.google.com/docs/emulator-suite/connect_firestore).
