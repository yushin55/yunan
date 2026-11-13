# Google 로그인 설정 확인

`auth/operation-not-allowed`는 Firebase 프로젝트에서 Google 제공자가 없거나 꺼져 있을 때 발생합니다. 프런트엔드 로그인 버튼이나 `.env`의 API 키를 바꾸는 것으로 해결되지 않습니다.

1. `frontend/.env`의 `VITE_FIREBASE_PROJECT_ID`와 같은 프로젝트를 [Firebase 콘솔](https://console.firebase.google.com/)에서 선택합니다.
2. **빌드 → Authentication → Sign-in method(로그인 방법)**에서 **새 제공업체 추가 → Google**을 선택합니다.
3. **사용 설정**을 켜고 **프로젝트 지원 이메일**을 선택한 다음 **저장**합니다. Google OAuth 웹 클라이언트가 함께 구성됩니다.
4. **Authentication → Settings → 승인된 도메인**에 실제 앱의 호스트가 있는지 확인합니다. 로컬 주소가 `http://localhost:5173`이면 `localhost`를 등록합니다. 포트와 프로토콜은 넣지 않습니다.
5. 앱에서 다시 Google 로그인을 누릅니다. 제공자 설정 변경만 했다면 앱을 재배포하거나 개발 서버를 재시작할 필요는 없습니다.

콘솔의 언어에 따라 메뉴 이름이 다를 수 있습니다. Google 사용 설정 시 별도 OAuth 설정 오류가 나오면 [Firebase 공식 문제 해결 안내](https://firebase.google.com/docs/auth/faq-and-troubleshooting#how_do_i_manually_construct_an_oauth_web_client)를 확인합니다.

## 계정 로그인 없이 설정 점검

저장소 루트에서 다음 명령을 실행합니다.

```powershell
npm --prefix frontend run auth:check
# 운영 환경 파일과 배포 주소로 확인할 때
npm --prefix frontend run auth:check -- production https://YOUR_APP_HOST
```

이 명령은 Vite와 동일하게 해당 모드의 `.env` 파일을 읽고, 공개 Firebase Web API 키로 Google 인증 URL 생성 여부를 확인합니다. 계정을 생성하거나 사용자 로그인을 수행하지 않으며, 서비스 계정과 OAuth Secret은 사용하지 않습니다. 에뮬레이터 모드에서는 실제 Google 설정 점검을 건너뜁니다. 성공해도 계정 선택·동의·앱 복귀까지의 전체 흐름은 브라우저에서 확인해야 합니다.

프런트엔드의 Firebase 프로젝트 ID와 백엔드의 `FIREBASE_PROJECT_ID`는 같아야 합니다. 서비스 계정 및 OAuth Secret은 서버 전용으로 보관하고 `VITE_` 환경변수에 넣지 않습니다.

공식 문서: [웹 Google 로그인 설정](https://firebase.google.com/docs/auth/web/google-signin), [제공자 관리 API](https://firebase.google.com/docs/auth/configure-oauth-rest-api).
