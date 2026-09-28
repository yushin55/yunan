import { lazy, Suspense, useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Fingerprint,
  Gamepad2,
  KeyRound,
  Layers3,
  LockKeyhole,
  MessageCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
} from "../components/common/Icon";
import Modal from "../components/common/Modal";
import { api } from "../lib/api";
import { createPractice } from "../lib/practice";
import topicData from "../data/topics.json";
const LoungeScene = lazy(() => import("../components/scene/LoungeScene"));
export default function HomePage({ join = false }: { join?: boolean }) {
  const [search] = useSearchParams();
  const [mode, setMode] = useState<"create" | "join" | null>(
    join ? "join" : null,
  );
  const [nickname, setNickname] = useState(
    localStorage.getItem("yunan.nickname") || "",
  );
  const [code, setCode] = useState(search.get("code") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const close = useCallback(() => {
    if (!busy) setMode(null);
  }, [busy]);
  async function enter(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      localStorage.setItem("yunan.nickname", nickname.trim());
      const snapshot = await api(
        mode === "create" ? "/api/rooms" : "/api/rooms/join",
        mode === "create"
          ? { nickname: nickname.trim() }
          : { nickname: nickname.trim(), code: code.trim().toUpperCase() },
      );
      navigate(`/room/${snapshot.room.roomId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function practice() {
    createPractice(nickname.trim() || "나");
    navigate("/practice");
  }
  return (
    <main className="home">
      <section className="hero" id="about">
        <div className="hero-copy">
          <div className="intro-pill">
            <span className="live-dot" />
            새로운 관점의 소셜 추리 게임
          </div>
          <h1>
            오늘 밤,
            <br />
            당신은 누구의
            <br />
            <span>편인가요?</span>
            <span className="heading-star">✳</span>
          </h1>
          <p className="hero-description">
            반대편을 이기지 마세요.
            <br />
            <strong>반대편이 되어 살아남으세요.</strong>
          </p>
          <p className="hero-secondary">
            낯선 역할을 맡고, 서로의 진심을 추리하는 시간.
            <br />
            당신의 생각이 뒤집히는 테이블에 초대합니다.
          </p>
          <div className="hero-buttons">
            <button
              className="button primary"
              onClick={() => {
                setError("");
                setMode("create");
              }}
            >
              <Plus size={19} />
              테이블 만들기
              <ArrowUpRight size={18} />
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setError("");
                setMode("join");
              }}
            >
              <KeyRound size={17} />
              초대 코드로 입장
            </button>
          </div>
          <button className="practice-link" onClick={practice}>
            <Gamepad2 size={16} />
            먼저 혼자 연습해 볼래요 <ArrowRight size={15} />
          </button>
          <div className="game-facts">
            <span>
              <Users size={15} />
              4–6명
            </span>
            <i />
            <span>
              <Clock3 size={15} />
              7–10분
            </span>
            <i />
            <span>
              <MessageCircle size={15} />
              남성 내레이션과 함께
            </span>
          </div>
        </div>
        <div className="hero-stage">
          <div className="scene-topline">
            <span>
              <span className="live-dot" />
              THE OTHER SIDE
            </span>
            <span>LOUNGE № 01</span>
          </div>
          <div className="hero-canvas">
            <Suspense
              fallback={
                <div className="scene-loading">
                  <span className="spinner" />
                  라운지의 불을 켜는 중...
                </div>
              }
            >
              <LoungeScene mode="home" />
            </Suspense>
          </div>
          <div className="scene-title">
            <span className="scene-title-line" />
            <span>같은 테이블, 서로 다른 속마음.</span>
            <span className="scene-title-line" />
          </div>
          <div className="floating-note">
            <span className="note-icon">
              <Fingerprint size={23} />
            </span>
            <div>
              <span>당신의 역할은 비밀입니다</span>
              <strong>끝까지 들키지 않을 자신 있나요?</strong>
            </div>
            <LockKeyhole size={15} />
          </div>
          <div className="scene-foot">
            <span>
              <span className="seat-dots">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              당신을 위한 자리가 있어요
            </span>
            <span>드래그하여 둘러보기 ↔</span>
          </div>
        </div>
      </section>
      <section className="belief-strip">
        <div className="mini-logo">
          유난스러운<span>생각의 시작.</span>
        </div>
        <p>
          생각이 달라도, 테이블은 함께.
          <br />
          <strong>설득보다 이해가 필요한 우리를 위한 게임.</strong>
        </p>
        <div className="belief-tags">
          <span>
            <ShieldCheck size={15} />
            익명으로 안전하게
          </span>
          <span>
            <Check size={15} />
            생각을 바꿀 필요 없이
          </span>
        </div>
      </section>
      <section className="how-section" id="how">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HOW TO PLAY</span>
            <h2>세 번의 반전, 하나의 새로운 시선.</h2>
          </div>
          <span className="section-caption">승부는 짧게. 여운은 길게.</span>
        </div>
        <div className="how-grid">
          <article className="how-card">
            <div className="step-top">
              <span>01</span>
              <Layers3 size={25} />
            </div>
            <h3>낯선 역할에 앉으세요.</h3>
            <p>
              무작위로 정해진 이슈와 역할.
              <br />내 생각과 다르더라도, 이번엔 그 사람의 편.
            </p>
            <span className="step-tag">역할 배정 & 관점 카드</span>
          </article>
          <article className="how-card">
            <div className="step-top">
              <span>02</span>
              <MessageCircle size={25} />
            </div>
            <h3>말 속의 틈을 찾으세요.</h3>
            <p>
              입장을 밝히고, 사건에 대응하고, 질문하세요.
              <br />
              누가 낯선 관점을 연기하고 있을까요?
            </p>
            <span className="step-tag">토론 & 전환자 추리</span>
          </article>
          <article className="how-card">
            <div className="step-top">
              <span>03</span>
              <Fingerprint size={25} />
            </div>
            <h3>가면 뒤의 나를 만나요.</h3>
            <p>
              역할을 내려놓고 돌아보는 진짜 생각.
              <br />
              같은 의견이어도, 조금 더 넓어진 시선.
            </p>
            <span className="step-tag">정체 공개 & 나의 목소리</span>
          </article>
        </div>
      </section>
      <section className="topics-section" id="topics">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ON THE TABLE</span>
            <h2>오늘, 어떤 이야기가 펼쳐질까요?</h2>
          </div>
          <span className="subtle">
            <Sparkles size={14} />매 게임 무작위 주제
          </span>
        </div>
        <div className="topic-grid">
          {topicData.map((topic, i) => (
            <article className="topic-preview" key={topic.topicId}>
              <div>
                  <span className="topic-number">{String(i + 1).padStart(2, "0")}</span>
                <span className="topic-category">{topic.tags[0]}</span>
              </div>
              <h3>{topic.shortTitle || topic.title}</h3>
              <p>{topic.title}</p>
              <span className="topic-bottom">
                6개의 관점 <span>가상 토론 제안</span>
              </span>
            </article>
          ))}
        </div>
        <p className="privacy-note">
          <LockKeyhole size={13} />
          실제 의견은 나만 볼 수 있어요. 마지막에 공유를 선택한 이야기만 함께
          나눕니다.
        </p>
      </section>
      <footer>
        <LinkBrand />
        <span>다른 생각을 잇는 팀, 브릿지</span>
        <span>© 2026 BRIDGE · MADE FOR PERSPECTIVE</span>
      </footer>
      {mode && (
        <Modal
          title={
            mode === "create"
              ? "당신의 테이블을 열어요."
              : "초대받은 자리에 앉아요."
          }
          onClose={close}
        >
          <p className="modal-description">
            실명 대신, 오늘 밤의 이름만 알려주세요.
          </p>
          <form onSubmit={enter}>
            <label className="field-label" htmlFor="nickname">
              닉네임
            </label>
            <input
              id="nickname"
              autoFocus
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              minLength={1}
              maxLength={12}
              required
              placeholder="어떻게 불러드릴까요?"
              autoComplete="nickname"
            />
            {mode === "join" && (
              <>
                <label className="field-label" htmlFor="code">
                  6자리 초대 코드
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
                  placeholder="ABC123"
                  autoComplete="off"
                />
              </>
            )}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              type="submit"
              disabled={busy || !nickname.trim()}
            >
              {busy ? (
                <>
                  <span className="spinner" />
                  테이블에 연결 중...
                </>
              ) : (
                <>
                  {mode === "create" ? "테이블 만들기" : "테이블 입장하기"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <div className="modal-foot">
            <LockKeyhole size={13} />
            익명으로 입장하며, 음성과 카메라는 사용하지 않아요.
          </div>
          {error && (
            <button className="button text-button full" onClick={practice}>
              서버 없이 혼자 연습하기 <ArrowRight size={15} />
            </button>
          )}
        </Modal>
      )}
    </main>
  );
}
function LinkBrand() {
  return (
    <a href="#" className="footer-brand">
      유난<span>.</span>
    </a>
  );
}
