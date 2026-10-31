import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { api } from "../lib/api";
import { rememberNickname, savedNickname } from "../features/room/roomStorage";

export default function JoinPage() {
  const [search] = useSearchParams();
  const [code, setCode] = useState((search.get("code") || "").toUpperCase());
  const [nickname, setNickname] = useState(savedNickname());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      rememberNickname(nickname.trim());
      const snapshot = await api("/api/rooms/join", { nickname: nickname.trim(), code: code.trim().toUpperCase() });
      navigate(`/room/${snapshot.room.roomId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="join">
      <form className="panel join-card" onSubmit={join}>
        <span className="eyebrow">학생 입장</span>
        <h1>게임에 들어가기</h1>
        <label className="field-label" htmlFor="code">
          방 코드 6자리
        </label>
        <input
          id="code"
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          minLength={6}
          maxLength={6}
          pattern="[A-Za-z0-9]{6}"
          required
          autoComplete="off"
          placeholder="ABC123"
        />
        <label className="field-label" htmlFor="nickname">
          닉네임
        </label>
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          minLength={1}
          maxLength={12}
          required
          autoComplete="off"
          placeholder="게임에서 쓸 이름 (12자 이내)"
        />
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full large" type="submit" disabled={busy || !nickname.trim() || code.length !== 6}>
          {busy ? "들어가는 중…" : "입장하기"} <ArrowRight size={18} />
        </button>
        <p className="muted small">
          <LockKeyhole size={13} aria-hidden /> 회원가입 없이 이 기기의 익명 세션으로 참여해요. 연결이 끊겨도 같은 기기로 다시 들어오면 내 역할로 돌아와요.
        </p>
      </form>
    </main>
  );
}
