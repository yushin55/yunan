import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { exchangeKakaoCode, takeKakaoState } from "../features/auth/kakao";
import { signInWithKakaoToken } from "../lib/firebase";

/** Kakao sends the teacher back here with `?code=&state=`; sign in and return to where they started. */
export default function KakaoCallbackPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice; a Kakao code works only once.
    if (started.current) return;
    started.current = true;
    const saved = takeKakaoState();
    const code = search.get("code");
    if (search.get("error")) return setError("카카오 로그인을 취소했어요.");
    if (!code || !saved || saved.state !== search.get("state")) return setError("로그인 요청을 확인하지 못했어요. 처음부터 다시 시도해 주세요.");
    const next = saved.next.startsWith("/") && !saved.next.startsWith("//") ? saved.next : "/teacher/new";
    exchangeKakaoCode(code)
      .then(signInWithKakaoToken)
      .then(() => navigate(next, { replace: true }))
      .catch((e: Error) => setError(e.message || "카카오 로그인을 하지 못했어요."));
  }, [search, navigate]);

  if (error)
    return (
      <main className="page-loading">
        <p className="error-box" role="alert">
          {error}
        </p>
        <Link to="/teacher/new" className="button primary">
          로그인 화면으로
        </Link>
      </main>
    );
  return (
    <main className="page-loading">
      <span className="spinner" /> 카카오 로그인 중이에요.
    </main>
  );
}
