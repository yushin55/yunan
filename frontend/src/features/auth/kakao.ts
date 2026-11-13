// Kakao Login (REST): send the teacher to Kakao, and on return trade the code for a Firebase token.
// No Kakao SDK: the authorization URL and our server do the work.
const env = import.meta.env;
const base = env.VITE_API_BASE_URL || "http://localhost:8000";
const STATE = "bridge.kakaoState";

export const kakaoEnabled = !!env.VITE_KAKAO_REST_API_KEY;
export const kakaoRedirectUri = () => `${location.origin}/auth/kakao`;

/** Leaves the app for Kakao's consent page; `next` is where to land after signing in. */
export function startKakaoLogin(next: string) {
  const state = crypto.randomUUID();
  try {
    sessionStorage.setItem(STATE, JSON.stringify({ state, next }));
  } catch {
    /* Without storage the callback cannot check the state and will ask to try again. */
  }
  const query = new URLSearchParams({
    client_id: env.VITE_KAKAO_REST_API_KEY,
    redirect_uri: kakaoRedirectUri(),
    response_type: "code",
    state,
  });
  location.assign(`https://kauth.kakao.com/oauth/authorize?${query}`);
}

/** The state saved before leaving, removed once read so a code is never used twice. */
export function takeKakaoState(): { state: string; next: string } | null {
  try {
    const raw = sessionStorage.getItem(STATE);
    sessionStorage.removeItem(STATE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Kakao authorization code → Firebase custom token, checked by our server. */
export async function exchangeKakaoCode(code: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/auth/kakao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirectUri: kakaoRedirectUri() }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.token !== "string") {
    throw new Error(typeof data.detail === "string" ? data.detail : "카카오 로그인을 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return data.token;
}
