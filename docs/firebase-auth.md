# Google 로그인 설정 확인

`auth/operation-not-allowed`는 Firebase 프로젝트에서 Google 제공자가 없거나 꺼져 있을 때 발생합니다. 프런트엔드 로그인 버튼이나 `.env`의 API 키를 바꾸는 것으로 해결되지 않습니다.

1. `frontend/.env`의 `VITE_FIREBASE_PROJECT_ID`와 같은 프로젝트를 [Firebase 콘솔](https://console.firebase.google.com/)에서 선택합니다.
2. **빌드 → Authentication → Sign-in method(로그인 방법)**에서 **새 제공업체 추가 → Google**을 선택합니다.
3. **사용 설정**을 켜고 **프로젝트 지원 이메일**을 선택한 다음 **저장**합니다. Google OAuth 웹 클라이언트가 함께 구성됩니다.
4. **Authentication → Settings → 승인된 도메인**에 실제 앱의 호스트가 있는지 확인합니다. 로컬 주소가 `http://localhost:5173`이면 `localhost`를 등록합니다. 포트와 프로토콜은 넣지 않습니다.
5. 앱에서 다시 Google 로그인을 누릅니다. 제공자 설정 변경만 했다면 앱을 재배포하거나 개발 서버를 재시작할 필요는 없습니다.

콘솔의 언어에 따라 메뉴 이름이 다를 수 있습니다. Google 사용 설정 시 별도 OAuth 설정 오류가 나오면 [Firebase 공식 문제 해결 안내](https://firebase.google.com/docs/auth/faq-and-troubleshooting#how_do_i_manually_construct_an_oauth_web_client)를 확인합니다.

## `auth/unauthorized-domain`: 접속 주소 등록

이 오류는 브라우저 주소창의 호스트가 Firebase의 승인된 도메인에 없을 때 발생합니다. `VITE_FIREBASE_AUTH_DOMAIN`은 Firebase 인증 처리 주소이므로, 이 값을 현재 사이트 주소로 바꾸는 것으로 해결하지 않습니다.

`frontend/.env`의 프로젝트에서 **Authentication → Settings → 승인된 도메인 → 도메인 추가**를 열고 실제 접속 호스트만 등록합니다.

| 브라우저 주소 예시 | 등록할 값 |
| --- | --- |
| `http://localhost:5173/teacher` | `localhost` |
| `http://127.0.0.1:5173/teacher` | `127.0.0.1` |
| `http://192.168.0.10:5173/teacher` | `192.168.0.10` |
| `https://my-class.vercel.app/teacher` | `my-class.vercel.app` |

`localhost`를 허용해도 `127.0.0.1`이나 LAN IP가 자동으로 허용되지는 않습니다. 개발 PC에서는 이미 허용된 `http://localhost:5173`으로 접속할 수도 있습니다. 다른 기기의 `localhost`는 그 기기 자신을 가리키므로, 다른 기기에서 선생님 로그인을 하려면 실제 접속 IP나 배포 도메인을 등록해야 합니다. 등록 후 페이지를 새로고침하고 다시 로그인합니다.

2025년 4월 28일 이후 생성한 프로젝트는 `localhost`가 기본 등록되지 않습니다. [Firebase 공식 안내](https://firebase.google.com/docs/auth/faq-and-troubleshooting)

## 계정 로그인 없이 설정 점검

저장소 루트에서 다음 명령을 실행합니다.

```powershell
npm --prefix frontend run auth:check
# 오류가 난 브라우저의 실제 주소로 확인할 때
npm --prefix frontend run auth:check -- development http://127.0.0.1:5173
# 운영 환경 파일과 배포 주소로 확인할 때
npm --prefix frontend run auth:check -- production https://YOUR_APP_HOST
```

이 명령은 Vite와 동일하게 해당 모드의 `.env` 파일을 읽고, 공개 Firebase Web API 키로 **접속 호스트 허용 여부와 Google 인증 URL 생성 여부**를 확인합니다. 인증 URL만 생성하면 승인되지 않은 도메인도 성공으로 보일 수 있어, 브라우저 Firebase SDK와 같은 프로젝트 설정으로 도메인을 먼저 검사합니다. 계정을 생성하거나 사용자 로그인을 수행하지 않으며, 서비스 계정과 OAuth Secret은 사용하지 않습니다. 에뮬레이터 모드에서는 실제 Google 설정 점검을 건너뜁니다. 성공해도 계정 선택·동의·앱 복귀까지의 전체 흐름은 브라우저에서 확인해야 합니다.

프런트엔드의 Firebase 프로젝트 ID와 백엔드의 `FIREBASE_PROJECT_ID`는 같아야 합니다. 서비스 계정 및 OAuth Secret은 서버 전용으로 보관하고 `VITE_` 환경변수에 넣지 않습니다.

공식 문서: [웹 Google 로그인 설정](https://firebase.google.com/docs/auth/web/google-signin), [제공자 관리 API](https://firebase.google.com/docs/auth/configure-oauth-rest-api).
