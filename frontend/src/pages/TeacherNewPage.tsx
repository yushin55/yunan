import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Shuffle } from "lucide-react";
import { api } from "../lib/api";
import TopicPicker from "../features/topics/TopicPicker";
import { useTopics } from "../features/topics/useTopics";

export default function TeacherNewPage() {
  const { catalog, error: loadError } = useTopics();
  const [topicId, setTopicId] = useState<string | null>(null);
  const [random, setRandom] = useState(false);
  const [switchers, setSwitchers] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const snapshot = await api("/api/rooms", { ...(random ? { randomTopic: true } : { topicId }), switcherCount: switchers });
      navigate(`/room/${snapshot.room.roomId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="setup">
      <span className="eyebrow">선생님 · 게임 방 만들기</span>
      <h1>오늘 수업의 주제를 골라 주세요</h1>
      <p className="muted">브릿지가 미리 검토한 사회 문제 6개 중에서 고르거나, 무작위로 정할 수 있어요. 방을 연 뒤 대기실에서도 바꿀 수 있어요.</p>
      {loadError && <p className="error-box">{loadError}</p>}
      {!catalog && !loadError && (
        <p className="page-loading">
          <span className="spinner" /> 주제를 불러오는 중이에요.
        </p>
      )}
      {catalog && (
        <>
          <TopicPicker
            topics={catalog.topics}
            selected={random ? null : topicId}
            randomSelected={random}
            onSelect={(id) => {
              setTopicId(id);
              setRandom(false);
            }}
            onRandom={() => {
              setRandom(true);
              setTopicId(null);
            }}
            disabled={busy}
          />
          {random && (
            <p className="banner ok">
              <Shuffle size={16} aria-hidden /> 방을 만들 때 6개 주제 중 하나가 무작위로 정해져요.
            </p>
          )}
          <fieldset className="inline-field">
            <legend>역할 전환자 수</legend>
            <div className="segmented">
              {([1, 2] as const).map((n) => (
                <label key={n} className={switchers === n ? "active" : ""}>
                  <input type="radio" name="switchers" checked={switchers === n} onChange={() => setSwitchers(n)} /> {n}명
                </label>
              ))}
            </div>
            <small className="muted">처음에는 1명을 추천해요. 단계별 시간은 대기실에서 바꿀 수 있어요.</small>
          </fieldset>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <button className="button primary large" data-testid="create-room" disabled={busy || (!topicId && !random)} onClick={create}>
            {busy ? "방을 만드는 중…" : "게임 방 만들기"} <ArrowRight size={18} />
          </button>
        </>
      )}
    </main>
  );
}
