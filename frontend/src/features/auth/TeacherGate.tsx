import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { LogOut } from "lucide-react";
import { auth, isTeacher, signInAsTestTeacher, signInWithGoogle, signOutTeacher, useEmulators } from "../../lib/firebase";
import { kakaoEnabled, startKakaoLogin } from "./kakao";

/** Teacher pages: shown only to a teacher signed in with Google or Kakao. Students never need this. */
export default function TeacherGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined)
    return (
      <main className="page-loading">
        <span className="spinner" /> 로그인 정보를 확인하는 중이에요.
      </main>
    );
  if (!isTeacher(user)) return <TeacherLogin />;
  return (
    <>
      <div className="teacher-account" data-testid="teacher-account">
        <span className="muted small">{user.displayName || user.email || "선생님"} 선생님</span>
        <button type="button" className="button ghost small" onClick={() => signOutTeacher()}>
          <LogOut size={15} aria-hidden /> 로그아웃
        </button>
      </div>
      {children}
    </>
  );
}

function TeacherLogin() {
  const { pathname, search } = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (signIn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await signIn();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        console.error("Teacher sign-in failed", e);
        setError(loginErrorMessage(code));
      }
      setBusy(false);
    }
  };

  return (
    <main className="setup teacher-login">
      <section className="panel login-card">
        <span className="eyebrow">선생님 로그인</span>
        <h1>방을 만들려면 로그인해 주세요</h1>
        <p className="muted">게임 방을 열고 진행하는 선생님만 로그인이 필요해요. 학생은 로그인 없이 방 코드로 바로 들어와요.</p>
        <div className="login-buttons">
          <button type="button" className="login-button google" data-testid="login-google" disabled={busy} onClick={() => run(signInWithGoogle)}>
            <GoogleMark /> 구글로 로그인
          </button>
          {kakaoEnabled && (
            <button type="button" className="login-button kakao" data-testid="login-kakao" disabled={busy} onClick={() => startKakaoLogin(pathname + search)}>
              <KakaoMark /> 카카오로 로그인
            </button>
          )}
          {useEmulators && (
            <button type="button" className="button ghost small" data-testid="login-test" disabled={busy} onClick={() => run(signInAsTestTeacher)}>
              테스트 선생님으로 로그인 (에뮬레이터)
            </button>
          )}
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

// Sign-in failures caused by the Firebase project's settings, not by the teacher: retrying will not help.
const SETUP_ERRORS = ["auth/operation-not-allowed", "auth/configuration-not-found", "auth/unauthorized-domain", "auth/invalid-api-key", "auth/api-key-not-valid"];

/** What the teacher sees, with the Firebase code appended so whoever runs the site can tell the cause. */
function loginErrorMessage(code: string) {
  const text =
    code === "auth/popup-blocked"
      ? "팝업이 차단되었어요. 브라우저에서 팝업을 허용해 주세요."
      : code === "auth/network-request-failed"
        ? "인터넷 연결을 확인하고 다시 시도해 주세요."
        : SETUP_ERRORS.includes(code)
          ? "이 사이트에서 지금은 구글 로그인을 쓸 수 없어요. 사이트 관리자에게 알려 주세요."
          : "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.";
  return code && code !== "auth/popup-blocked" ? `${text} (${code})` : text;
}

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 7.1-10.3 6.9-17.7z" />
    <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

const KakaoMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path fill="#000" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7l-1 3.6c-.1.3.3.6.6.4l4.2-2.8c.5.1 1 .1 1.5.1 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
  </svg>
);
