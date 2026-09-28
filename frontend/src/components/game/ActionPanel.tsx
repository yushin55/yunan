import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Position, Snapshot, Topic } from "../../types/game";
import { PHASE_LABELS, PLAYER_COLORS, POSITIONS } from "../../types/game";
import { ArrowRight, Check, EyeOff, Fingerprint, LockKeyhole, Send, ShieldCheck } from "../common/Icon";
import "./ActionPanel.css";

type Action = (name: string, body?: Record<string, unknown>) => Promise<Snapshot | null>;
type RatingKey = "accuracy" | "respect" | "evidence";
/** avatar: a seat colour, so people are chosen by face; quote: what they said in public. */
type DeckItem = { id: string; title: string; detail?: string; label?: string; avatar?: string; quote?: string };

interface Props {
  snapshot: Snapshot;
  action: Action;
  busy: boolean;
  practice: boolean;
  focusPlayerUid?: string;
  onDeal?: () => void;
  /** A card was chosen (sound feedback). */
  onPick?: () => void;
  /** While waiting for others: look at the table / open private notes. */
  onLookAround?: () => void;
  onOpenNotes?: () => void;
}

const clues = ["관점의 일관성", "주장과 근거의 연결", "사건 대응의 우선순위", "질문에 대한 답변"];
const ratingCriteria: { id: RatingKey; title: string; detail: string }[] = [
  { id: "accuracy", title: "역할을 얼마나 정확하게 대변했나요?", detail: "역할의 관점과 우선순위를 잘 이해하고 말했는지 평가해요." },
  { id: "respect", title: "다른 관점을 존중했나요?", detail: "반대 의견도 공정하게 듣고 답했는지 평가해요." },
  { id: "evidence", title: "근거를 잘 활용했나요?", detail: "관점 카드와 구체적인 이유로 주장을 뒷받침했는지 평가해요." },
];

export default function ActionPanel({ snapshot: s, action, busy, practice, focusPlayerUid, onDeal, onPick, onLookAround, onOpenNotes }: Props) {
  const phase = s.room.phase;
  const topic = s.room.topic!;
  const player = s.participants.find((p) => p.uid === s.me.uid);
  const others = s.participants.filter((p) => p.uid !== s.me.uid);
  const role = topic?.roles.find((r) => r.id === s.me.roleId);
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [position, setPosition] = useState<Position | "">("");
  const [prefs, setPrefs] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [option, setOption] = useState("");
  const [card, setCard] = useState("");
  const [connection, setConnection] = useState("");
  const [clue, setClue] = useState(clues[0]);
  const [understood, setUnderstood] = useState("");
  const [disagree, setDisagree] = useState("");
  const [share, setShare] = useState(false);
  const [ratings, setRatings] = useState<Record<RatingKey, number>>({ accuracy: 3, respect: 3, evidence: 3 });
  const [rated, setRated] = useState<string[]>(s.me.ratedTargets || []);
  const [incomingIndex, setIncomingIndex] = useState(0);
  const [revealIndex, setRevealIndex] = useState(0);
  const [criterionIndex, setCriterionIndex] = useState(0);

  useEffect(() => {
    setStep(0);
    setText("");
    setReason("");
    setTarget("");
    setOption("");
    setCard("");
    setConnection("");
    setClue(clues[0]);
    setIncomingIndex(0);
    setRevealIndex(0);
    setCriterionIndex(0);
    if (phase === "initial") {
      setPosition("");
      setPrefs([]);
    }
    if (phase === "reflection") {
      setPosition("");
      setUnderstood("");
      setDisagree("");
      setShare(false);
    }
  }, [phase, s.room.roomId]);

  useEffect(() => { setRated(s.me.ratedTargets || []); }, [s.me.ratedTargets?.join("|")]);
  useEffect(() => {
    if (focusPlayerUid && focusPlayerUid !== s.me.uid &&
        ["question", "guess", "reveal"].includes(phase) && !rated.includes(focusPlayerUid)) {
      setTarget(focusPlayerUid);
    }
  }, [focusPlayerUid, phase, rated, s.me.uid]);

  const submitted = player?.submitted?.includes(phase);
  const waiting = submitted && !["question", "reveal"].includes(phase);
  const send = (name: string, body?: Record<string, unknown>) => { if (!busy) void action(name, body); };
  const positionCards: DeckItem[] = POSITIONS.map((p) => ({
    id: p.value, title: p.label,
    detail: p.value === "neutral" ? "조금 더 듣고 판단할게요." : "지금의 나에게 가장 가까운 생각이에요.",
    label: "비공개 · 나의 진짜 생각",
  }));
  const lastWords = (uid: string) => {
    const claim = s.rounds.claim?.find((r) => r.uid === uid && !r.timedOut)?.text;
    const option = s.rounds.scenario?.find((r) => r.uid === uid && !r.timedOut)?.optionId;
    const said = claim || topic.scenario.options.find((o) => o.id === option)?.text;
    return said ? (said.length > 64 ? said.slice(0, 62) + "…" : said) : undefined;
  };
  const playerCards: DeckItem[] = others.map((p) => ({
    id: p.uid, title: p.nickname,
    detail: topic.roles.find((r) => r.id === p.roleId)?.name || "테이블의 참가자",
    label: "테이블의 인물",
    avatar: PLAYER_COLORS[s.participants.findIndex((x) => x.uid === p.uid) % PLAYER_COLORS.length],
    quote: lastWords(p.uid),
  }));
  const roleCards: DeckItem[] = topic.roles.map((r) => ({
    id: r.id, title: r.name, detail: r.priority, label: "맡고 싶은 역할",
  }));
  const citationCards: DeckItem[] = [
    { id: "", title: "관점 카드를 사용하지 않을게요", detail: "내 말만으로 주장을 전할 수 있어요.", label: "선택 사항" },
    ...(s.me.cards || []).map((c) => ({ id: c.id, title: c.title, detail: c.text, label: c.label || "관점 카드" })),
  ];
  const citationReady = !card || !!connection.trim();
  const citationStep = <>
    <StepIntro label="근거 카드" text="카드를 쓰고 싶다면 한 장을 골라 내 주장과 직접 연결해 주세요." />
    <ChoiceDeck items={citationCards} value={card} onSelect={(id) => { setCard(id); if (!id) setConnection(""); }} selectLabel="이 카드 선택" onDeal={onDeal} onPick={onPick} />
    {card && <TextField id="connection" label="이 카드가 내 말과 어떻게 연결되나요?" value={connection} set={setConnection} max={140} required />}
  </>;

  if (waiting) {
    const doneCount = s.participants.filter((p) => p.submitted?.includes(phase)).length;
    return <div className="waiting-panel stage-waiting" role="status">
      <div className="waiting-icon"><Check size={30} /></div>
      <h3>당신의 선택을 받았어요.</h3>
      <p>모두가 제출하거나 시간이 끝나면 다음 장면이 열립니다.</p>
      <ul className="waiting-table" aria-label={`제출 ${doneCount} / ${s.participants.length}명`}>
        {s.participants.map((p, i) => {
          const done = p.submitted?.includes(phase);
          return <li key={p.uid} className={done ? "is-done" : ""} style={{ "--seat-color": PLAYER_COLORS[i % PLAYER_COLORS.length] } as CSSProperties}>
            <span>{p.uid === s.me.uid ? "나" : p.nickname.slice(0, 1)}</span>
            <small>{p.uid === s.me.uid ? "나" : p.nickname}</small>
            <em>{done ? "제출" : "생각 중"}</em>
          </li>;
        })}
      </ul>
      {(onLookAround || onOpenNotes) && <div className="waiting-actions">
        {onLookAround && <button type="button" onClick={onLookAround}>테이블 둘러보기</button>}
        {onOpenNotes && <button type="button" onClick={onOpenNotes}>추리 메모 쓰기</button>}
      </div>}
      <span className="subtle"><LockKeyhole size={14} /> 공개 전까지 안전하게 보관됩니다.</span>
    </div>;
  }

  if (phase === "topic") return <Panel tag="TONIGHT'S QUESTION" title="오늘의 주제">
    <div className="stage-spotlight"><span>{topic.tags.join(" · ")}</span><h3>{topic.title}</h3><p>{topic.background}</p></div>
    <p className="privacy-inline"><ShieldCheck size={15} /> 이 게임의 상황은 토론을 위한 가상 제안입니다.</p>
    {practice ? <ActionButton label="내 생각 선택하기" onClick={() => send("next")} busy={busy} /> : <p className="auto-notice">잠시 후 첫 번째 선택이 시작됩니다.</p>}
  </Panel>;

  if (phase === "initial") return <Panel tag="ONLY YOU CAN SEE" title="시작 전, 진짜 내 생각은?">
    <Flow step={step} setStep={setStep} labels={["나의 입장", "그 이유", `선호 역할 ${prefs.length}/2`, "제출"]} busy={busy}
      canNext={step !== 2 || prefs.length === 2} nextHint={prefs.length ? "2순위도 골라 주세요" : "1순위와 2순위를 골라 주세요"}
      submitLabel="비공개로 제출" canSubmit={!!position && !!reason.trim() && prefs.length === 2}
      onSubmit={() => send("initial-position", { position, reason, preferences: prefs })}>
      {step === 0 && <><StepIntro label="01 · 나의 입장" text="다른 사람의 의견을 듣기 전, 지금 생각을 골라 주세요." /><ChoiceDeck items={positionCards} value={position} onSelect={(id) => setPosition(id as Position)} selectLabel="이 입장 선택" onDeal={onDeal} onPick={onPick} /></>}
      {step === 1 && <><StepIntro label="02 · 선택의 이유" text="이 생각을 선택한 이유를 남겨 주세요. 나중에 나만 다시 볼 수 있어요." /><TextField id="reason" label="나의 이유" value={reason} set={setReason} max={140} required /></>}
      {step === 2 && <><StepIntro label="03 · 역할 카드" text="맡아 보고 싶은 역할을 두 개 골라 주세요. 먼저 고른 역할이 1순위가 됩니다." />
        <RankSlots slots={[0, 1].map((i) => topic.roles.find((r) => r.id === prefs[i])?.name)} onClear={(i) => setPrefs((v) => v.filter((_, n) => n !== i))} />
        <ChoiceDeck items={roleCards} selectedIds={prefs} onSelect={(id) => setPrefs((v) => v.includes(id) ? v.filter((x) => x !== id) : v.length < 2 ? [...v, id] : [v[0], id])}
          selectLabel={prefs.length === 0 ? "1순위로 고르기" : prefs.length === 1 ? "2순위로 고르기" : "2순위와 바꾸기"} onDeal={onDeal} onPick={onPick} /></>}
      {step === 3 && <ReviewCard rows={[["나의 입장", POSITIONS.find((p) => p.value === position)?.label || ""], ["그 이유", reason || "미작성"], ["선호 역할", prefs.map((id) => topic.roles.find((r) => r.id === id)?.name).join(" → ") || "미선택"]]} note="이 선택은 공개되지 않습니다." />}
    </Flow>
  </Panel>;

  if (phase === "role") return <Panel tag="YOUR SECRET ROLE" title="오늘 밤, 당신은">
    <div className="role-reveal stage-role-reveal"><Fingerprint size={36} /><h3>{role?.name}</h3><p>{role?.goal}</p><span className="tag">{s.me.isSwitcher ? "역할 전환자 · 선호 밖의 새로운 관점" : "선호 역할 · 나의 관점을 대변하기"}</span></div>
    <p className="privacy-inline"><LockKeyhole size={15} /> 역할 이름은 공개되지만 전환자 여부는 아직 비밀입니다.</p>
    {practice ? <ActionButton label="역할로 시작하기" onClick={() => send("next")} busy={busy} /> : <p className="auto-notice">잠시 후 입장 선언이 시작됩니다.</p>}
  </Panel>;

  if (phase === "claim") return <Panel tag="ROUND 01 · MAKE YOUR CASE" title="당신의 입장을 밝혀 주세요">
    <Flow step={step} setStep={setStep} labels={["입장 선언", "근거 카드"]} busy={busy}
      submitLabel="입장 선언 제출" canSubmit={!!text.trim() && citationReady}
      onSubmit={() => send("claim", { text, ...(card ? { cardId: card, cardConnection: connection } : {}) })}>
      {step === 0 && <><StepIntro label={role?.name || "나의 역할"} text={`${role?.name || "맡은 역할"}의 관점에서 짧고 분명하게 말해 주세요.`} /><TextField id="claim" label="나의 입장 선언" value={text} set={setText} max={100} required placeholder="제가 가장 중요하게 생각하는 것은…" /></>}
      {step === 1 && citationStep}
    </Flow>
    <p className="privacy-inline"><LockKeyhole size={13} /> 전원 제출 또는 마감 후 동시에 공개됩니다.</p>
  </Panel>;

  if (phase === "scenario") return <Panel tag="ROUND 02 · UNEXPECTED TURN" title="테이블에 사건이 도착했어요">
    <Flow step={step} setStep={setStep} labels={["사건 카드", "나의 이유", "근거 카드"]} busy={busy}
      submitLabel="사건 대응 제출" canSubmit={!!option && !!reason.trim() && citationReady}
      onSubmit={() => send("scenario", { optionId: option, reason, ...(card ? { cardId: card, cardConnection: connection } : {}) })}>
      {step === 0 && <><div className="scenario-card stage-scenario"><span className="eyebrow">가상 사건 카드</span><h3>{topic.scenario.title}</h3><p>{topic.scenario.description}</p></div><StepIntro label="당신의 대응은?" text="선택지를 한 장씩 넘겨 가장 가까운 대응을 골라 주세요." /><ChoiceDeck items={topic.scenario.options.map((o, i) => ({ id: o.id, title: o.text, label: "선택지 " + String.fromCharCode(65 + i) }))} value={option} onSelect={setOption} selectLabel="이 대응 선택" onDeal={onDeal} onPick={onPick} /></>}
      {step === 1 && <><StepIntro label="선택의 이유" text="맡은 역할이라면 왜 이렇게 결정했을까요?" /><TextField id="reason" label="이 선택을 한 이유" value={reason} set={setReason} max={140} required /></>}
      {step === 2 && citationStep}
    </Flow>
  </Panel>;

  if (phase === "question") {
    const incoming = s.rounds.question?.filter((q) => q.targetUid === s.me.uid) || [];
    const currentIncoming = incoming[Math.min(incomingIndex, incoming.length - 1)];
    return <Panel tag="ROUND 03 · READ BETWEEN THE LINES" title="누구에게 물어볼까요?">
      {!submitted ? <Flow step={step} setStep={setStep} labels={["상대 선택", "질문 작성"]} busy={busy}
        submitLabel="질문 보내기" canSubmit={!!target && !!text.trim()}
        onSubmit={() => send("question", { targetUid: target, text })}>
        {step === 0 && <><StepIntro label="질문할 상대" text="앞에 앉은 사람을 직접 선택하거나 카드를 넘겨 골라 주세요." /><ChoiceDeck items={playerCards} value={target} onSelect={setTarget} selectLabel="이 사람에게 질문" onDeal={onDeal} onPick={onPick} /></>}
        {step === 1 && <><StepIntro label="교차 질문" text="실제 성향보다 역할의 논리와 일관성을 물어보세요." /><ChoiceDeck items={topic.questions.map((q, i) => ({ id: q, title: q, label: "질문 힌트 " + (i + 1) }))} value={text} onSelect={setText} selectLabel="이 질문 사용" onDeal={onDeal} onPick={onPick} /><TextField id="question" label="내 질문 · 직접 수정할 수 있어요" value={text} set={setText} max={100} required /></>}
      </Flow> : <p className="success-inline"><Check size={17} /> 질문을 보냈어요. 도착한 질문에 답해 주세요.</p>}
      {currentIncoming && <div className="stage-incoming"><div className="stage-incoming__top"><span className="eyebrow">나에게 도착한 질문 {Math.min(incomingIndex + 1, incoming.length)} / {incoming.length}</span>{incoming.length > 1 && <span><button type="button" onClick={() => setIncomingIndex((v) => (v - 1 + incoming.length) % incoming.length)} aria-label="이전 질문">‹</button><button type="button" onClick={() => setIncomingIndex((v) => (v + 1) % incoming.length)} aria-label="다음 질문">›</button></span>}</div><AnswerForm key={currentIncoming.questionId} question={currentIncoming.text || ""} answered={currentIncoming.answer} onAnswer={(answer) => action("answer", { questionId: currentIncoming.questionId, text: answer })} busy={busy} /></div>}
      {practice && submitted && <ActionButton label="질문을 마치고 추리하기" onClick={() => send("next")} busy={busy} secondary />}
    </Panel>;
  }

  if (phase === "guess") return <Panel tag="TIME TO GUESS" title="누가 역할 전환자일까요?">
    <Flow step={step} setStep={setStep} labels={["대상", "단서", "이유"]} busy={busy}
      submitLabel="추리 확정하기" canSubmit={!!target && !!reason.trim()}
      onSubmit={() => send("guess", { targetUid: target, reason, clue })}>
      {step === 0 && <><StepIntro label="역할 전환자 추리" text="선호하지 않았던 역할을 맡은 사람은 누구일까요?" /><ChoiceDeck items={playerCards} value={target} onSelect={setTarget} selectLabel="이 사람 지목" onDeal={onDeal} onPick={onPick} /></>}
      {step === 1 && <><StepIntro label="발견한 단서" text="어느 장면에서 힌트를 얻었나요?" /><ChoiceDeck items={clues.map((c, i) => ({ id: c, title: c, label: "단서 " + (i + 1) }))} value={clue} onSelect={setClue} selectLabel="이 단서 선택" onDeal={onDeal} onPick={onPick} /></>}
      {step === 2 && <><StepIntro label="마지막 추리" text="그렇게 생각한 이유를 남겨 주세요. 마감까지 비공개예요." /><TextField id="reason" label="추리한 이유" value={reason} set={setReason} max={50} required /><p className="stage-selection-summary">지목: {others.find((p) => p.uid === target)?.nickname || "미선택"} · 단서: {clue}</p></>}
    </Flow>
  </Panel>;

  if (phase === "reveal") {
    const revealed = s.rounds.reveal || [];
    const currentReveal = revealed[Math.min(revealIndex, revealed.length - 1)];
    const eligible = playerCards.filter((p) => !rated.includes(p.id));
    const criterion = ratingCriteria[criterionIndex];
    return <Panel tag="THE MASKS COME OFF" title="가면을 벗을 시간">
      <Flow step={step} setStep={setStep} labels={["정체 공개", "평가 상대", "역할 대변"]} busy={busy}
        submitLabel="참가자 평가 제출" canSubmit={!!target && !rated.includes(target)}
        onSubmit={async () => {
          const selectedTarget = target;
          const next = await action("rating", { targetUid: selectedTarget, ...ratings });
          if (next) { setRated((v) => [...v, selectedTarget]); setTarget(""); setStep(1); setCriterionIndex(0); }
        }}>
        {step === 0 && <><StepIntro label="정체 공개" text="한 장씩 넘기며 테이블의 진짜 배역을 확인하세요." />{currentReveal ? <div className="stage-reveal-card"><span>{s.participants.find((p) => p.uid === currentReveal.uid)?.nickname}</span><strong>{topic.roles.find((r) => r.id === currentReveal.roleId)?.name}</strong><em>{currentReveal.isSwitcher ? "역할 전환자" : "선호 역할"}</em><div className="deck-arrows"><button type="button" onClick={() => setRevealIndex((v) => (v - 1 + revealed.length) % revealed.length)} aria-label="이전 정체">‹</button><span>{revealIndex + 1} / {revealed.length}</span><button type="button" onClick={() => setRevealIndex((v) => (v + 1) % revealed.length)} aria-label="다음 정체">›</button></div></div> : <p className="body-copy">정체를 확인하고 있어요.</p>}</>}
        {step === 1 && <><StepIntro label="역할 대변 평가" text="실제 의견에 대한 동의가 아니라, 배역을 얼마나 충실히 대변했는지 평가해요." />{eligible.length ? <ChoiceDeck items={eligible} value={target} onSelect={setTarget} selectLabel="이 사람 평가" onDeal={onDeal} onPick={onPick} /> : <p className="stage-complete"><Check size={18} /> 모든 참가자 평가를 마쳤어요.</p>}{rated.length > 0 && <p className="stage-selection-summary">{rated.length}명 평가 완료</p>}</>}
        {step === 2 && <><StepIntro label="세 가지 평가 기준" text="기준을 한 장씩 넘기며 1점부터 5점까지 골라 주세요." /><div className="stage-criterion"><span className="eyebrow">기준 {criterionIndex + 1} / {ratingCriteria.length}</span><h3>{criterion.title}</h3><p>{criterion.detail}</p><div className="rating-row"><div role="group" aria-label={criterion.title}>{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={ratings[criterion.id] === n ? "selected" : ""} aria-label={criterion.title + " " + n + "점"} aria-pressed={ratings[criterion.id] === n} onClick={() => setRatings((v) => ({ ...v, [criterion.id]: n }))}>{n}</button>)}</div></div><div className="deck-arrows"><button type="button" onClick={() => setCriterionIndex((v) => (v - 1 + ratingCriteria.length) % ratingCriteria.length)} aria-label="이전 평가 기준">‹</button><span>{criterionIndex + 1} / {ratingCriteria.length}</span><button type="button" onClick={() => setCriterionIndex((v) => (v + 1) % ratingCriteria.length)} aria-label="다음 평가 기준">›</button></div></div><p className="stage-selection-summary">{others.find((p) => p.uid === target)?.nickname || "평가 상대 미선택"} · 정확성 {ratings.accuracy} / 존중 {ratings.respect} / 근거 {ratings.evidence}</p></>}
      </Flow>
      {practice && <ActionButton label="평가를 마치고 내 생각 돌아보기" onClick={() => send("next")} busy={busy} secondary />}
    </Panel>;
  }

  if (phase === "reflection") return <Panel tag="BACK TO YOUR OWN VOICE" title="이제, 진짜 나로 돌아옵니다">
    <Flow step={step} setStep={setStep} labels={["지금의 입장", "이해한 점", "남은 의문", "나의 의견"]} busy={busy}
      submitLabel="내 목소리 남기기" canSubmit={!!position && !!understood.trim() && !!disagree.trim() && !!text.trim()}
      onSubmit={() => send("reflection", { position, understood, disagree, opinion: text, share })}>
      {step === 0 && <><div className="original-position"><span><LockKeyhole size={13} /> 게임 전 나의 생각 · 나만 보기</span><strong>{POSITIONS.find((p) => p.value === s.me.initialPosition?.position)?.label || "미제출"}</strong><p>{s.me.initialPosition?.reason || "초기 의견을 남기지 않았어요."}</p></div><StepIntro label="지금의 내 입장" text="역할을 내려놓고, 이 순간의 생각을 골라 주세요." /><ChoiceDeck items={positionCards} value={position} onSelect={(id) => setPosition(id as Position)} selectLabel="이 입장 선택" onDeal={onDeal} onPick={onPick} /></>}
      {step === 1 && <><StepIntro label="새롭게 이해한 점" text="테이블에서 들은 말 중 이전보다 이해하게 된 것은 무엇인가요?" /><TextField id="understood" label="새롭게 이해한 점" value={understood} set={setUnderstood} max={140} required /></>}
      {step === 2 && <><StepIntro label="여전히 동의하지 않는 점" text="다른 관점을 이해해도 동의하지 않을 수 있어요." /><TextField id="disagree" label="여전히 동의하지 않는 점" value={disagree} set={setDisagree} max={140} required /></>}
      {step === 3 && <><StepIntro label="나의 진짜 의견" text="이제 역할이 아닌 나의 목소리로 적어 주세요." /><TextField id="opinion" label="지금, 나의 진짜 의견" value={text} set={setText} max={240} required /><label className="checkbox-label"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> 게임 후 의견을 이 테이블에 공유할게요</label><p className="privacy-inline"><ShieldCheck size={14} /> 생각이 바뀌지 않아도 점수는 깎이지 않아요.</p></>}
    </Flow>
  </Panel>;

  return <Panel tag="YUNAN" title={PHASE_LABELS[phase]} />;
}

function Panel({ tag, title, children }: { tag: string; title: string; children?: ReactNode }) {
  return <section className="action-panel stage-panel"><span className="eyebrow">{tag}</span><h2>{title}</h2>{children}</section>;
}
function StepIntro({ label, text }: { label: string; text: string }) {
  return <div className="stage-intro"><span className="eyebrow">{label}</span><p>{text}</p></div>;
}
function Flow({ step, setStep, labels, children, busy, submitLabel, canSubmit, onSubmit, canNext = true, nextHint }: {
  step: number; setStep: (step: number) => void; labels: string[]; children: ReactNode;
  busy: boolean; submitLabel: string; canSubmit: boolean; onSubmit: () => void | Promise<void>;
  /** When false, the current card must be completed before moving on; nextHint says what is missing. */
  canNext?: boolean; nextHint?: string;
}) {
  const last = labels.length - 1;
  return <div className="stage-flow" data-testid="action-step" data-step={step}>
    <div className="stage-progress" role="group" aria-label="진행 카드">
      {labels.map((label, i) => <button key={i} type="button" className={step === i ? "active" : ""} aria-current={step === i ? "step" : undefined} aria-label={(i + 1) + "단계 " + label} disabled={i > step && !canNext} onClick={() => setStep(i)}><span>{String(i + 1).padStart(2, "0")}</span><small>{label}</small></button>)}
    </div>
    <div className="stage-card-content" key={step}>{children}</div>
    <div className="stage-footer"><button type="button" data-testid="action-back" className="stage-back" disabled={step === 0} onClick={() => setStep(step - 1)}>이전 단계</button>{step < last ? <button type="button" data-testid="action-next" className={"stage-forward" + (canNext ? "" : " is-blocked")} disabled={!canNext} onClick={() => setStep(step + 1)}>{canNext ? <>다음 단계 <ArrowRight size={16} /></> : nextHint || "이 단계를 마쳐 주세요"}</button> : <button type="button" data-testid="action-submit" className="stage-forward stage-submit" disabled={busy || !canSubmit} onClick={() => void onSubmit()}>{busy ? <span className="spinner" /> : <Send size={15} />} {submitLabel}</button>}</div>
  </div>;
}
function ChoiceDeck({ items, value, selectedIds, onSelect: select, selectLabel, onDeal, onPick }: {
  items: DeckItem[]; value?: string; selectedIds?: string[]; onSelect: (id: string) => void; selectLabel: string; onDeal?: () => void; onPick?: () => void;
}) {
  const onSelect = (id: string) => { onPick?.(); select(id); };
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((item) => item.id === value)));
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dealtRef = useRef(false);
  useEffect(() => {
    if (!dealtRef.current && items.length) {
      dealtRef.current = true;
      onDeal?.();
    }
  }, [onDeal, items.length]);
  useEffect(() => {
    const selectedIndex = items.findIndex((item) => item.id === value);
    if (selectedIndex >= 0) setIndex(selectedIndex);
  }, [value, items.map((item) => item.id).join("|")]);
  if (!items.length) return <p className="body-copy">선택할 카드가 없어요.</p>;
  const current = items[Math.min(index, items.length - 1)];
  const selectedRank = selectedIds?.indexOf(current.id) ?? -1;
  const selected = value === current.id || selectedRank >= 0;
  const move = (direction: number) => setIndex((v) => (v + direction + items.length) % items.length);
  const previousIndex = (index - 1 + items.length) % items.length;
  const nextIndex = (index + 1) % items.length;
  const previous = items[previousIndex];
  const next = items[nextIndex];
  const chooseSide = (sideIndex: number) => { setIndex(sideIndex); onSelect(items[sideIndex].id); };
  const tarotStyle = { "--tarot-accent": ["#dbbc81", "#b5c9ad", "#d9a991", "#b8b5db", "#d2c58e"][index % 5] } as CSSProperties;
  const wordy = (item: DeckItem) => item.title.length > 22 || (item.detail?.length ?? 0) > 60 ? " is-wordy" : "";
  const face = (item: DeckItem) => item.avatar
    ? <span className="deck-face" style={{ "--seat-color": item.avatar } as CSSProperties} aria-hidden="true">{item.title.slice(0, 1)}</span>
    : <TarotSigil />;
  return <div className="deck"
    onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); } if (e.key === "ArrowRight") { e.preventDefault(); move(1); } }}
    onTouchStart={(e) => {
      if ((e.target as HTMLElement).closest("button, input, textarea, select")) { touchStart.current = null; return; }
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY };
    }}
    onTouchEnd={(e) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start || items.length < 2) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.35) move(dx < 0 ? 1 : -1);
    }}>
    <div className={`tarot-spread tarot-spread--${Math.min(items.length, 3)}`}>
      {items.length > 2 && <button type="button" className={"tarot-echo tarot-echo--previous" + wordy(previous) + (value === previous.id || selectedIds?.includes(previous.id) ? " is-selected" : "")} style={{ "--tarot-accent": ["#dbbc81", "#b5c9ad", "#d9a991", "#b8b5db", "#d2c58e"][previousIndex % 5] } as CSSProperties} aria-pressed={value === previous.id || !!selectedIds?.includes(previous.id)} onClick={() => chooseSide(previousIndex)} aria-label={`${previous.title} 카드 선택`}><span className="tarot-echo__number">{String(previousIndex + 1).padStart(2, "0")}</span>{face(previous)}{selectedIds?.includes(previous.id) && <span className="deck-choice__rank">{selectedIds.indexOf(previous.id) + 1}순위</span>}<strong>{previous.title}</strong><small>{selectedIds?.includes(previous.id) ? `${selectedIds.indexOf(previous.id) + 1}순위 선택됨` : "이 카드 선택"}</small></button>}
      <div key={current.id + ":" + index} className={"deck-choice" + wordy(current) + (selected ? " is-selected" : "")} data-testid="deck-choice" aria-live="polite" style={tarotStyle} onClick={(event) => { if (!(event.target as HTMLElement).closest("button")) onSelect(current.id); }}>
        <span className="deck-choice__label">{current.label || "선택 카드"}</span>
        <span className="deck-choice__number">{String(index + 1).padStart(2, "0")}</span>
        {selectedRank >= 0 && <span className="deck-choice__rank">{selectedRank + 1}순위</span>}
        {face(current)}
        <h3>{current.title}</h3>
        {current.detail && <p>{current.detail}</p>}
        {current.quote && <blockquote className="deck-quote">“{current.quote}”</blockquote>}
        <button type="button" data-testid="deck-select" className="deck-choice__select" aria-pressed={selected} onClick={() => onSelect(current.id)}>{selected ? selectedRank >= 0 ? (selectedRank + 1) + "순위 · 다시 누르면 해제" : "선택됨" : selectLabel} <Check size={14} /></button>
      </div>
      {items.length > 1 && <button type="button" className={"tarot-echo tarot-echo--next" + wordy(next) + (value === next.id || selectedIds?.includes(next.id) ? " is-selected" : "")} style={{ "--tarot-accent": ["#dbbc81", "#b5c9ad", "#d9a991", "#b8b5db", "#d2c58e"][nextIndex % 5] } as CSSProperties} aria-pressed={value === next.id || !!selectedIds?.includes(next.id)} onClick={() => chooseSide(nextIndex)} aria-label={`${next.title} 카드 선택`}><span className="tarot-echo__number">{String(nextIndex + 1).padStart(2, "0")}</span>{face(next)}{selectedIds?.includes(next.id) && <span className="deck-choice__rank">{selectedIds.indexOf(next.id) + 1}순위</span>}<strong>{next.title}</strong><small>{selectedIds?.includes(next.id) ? `${selectedIds.indexOf(next.id) + 1}순위 선택됨` : "이 카드 선택"}</small></button>}
    </div>
    <div className="deck-arrows tarot-nav" aria-live="polite"><button type="button" data-testid="deck-prev" onClick={() => move(-1)} aria-label="이전 선택지">‹</button><span>{index + 1} / {items.length}</span><button type="button" data-testid="deck-next" onClick={() => move(1)} aria-label="다음 선택지">›</button></div>
  </div>;
}
function RankSlots({ slots, onClear }: { slots: (string | undefined)[]; onClear: (index: number) => void }) {
  const nextEmpty = slots.findIndex((name) => !name);
  return <div className="rank-slots" role="group" aria-label="선호 역할 순위">
    {slots.map((name, i) => <div key={i} className={"rank-slot" + (name ? " is-filled" : "") + (i === nextEmpty ? " is-next" : "")}>
      <span className="rank-slot__rank">{i + 1}순위</span>
      <strong>{name || (i === nextEmpty ? "이번에 고를 역할" : "비어 있음")}</strong>
      {name && <button type="button" onClick={() => onClear(i)} aria-label={`${i + 1}순위 ${name} 선택 취소`}>×</button>}
    </div>)}
  </div>;
}
function TarotSigil() {
  return <svg className="tarot-sigil" viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <circle cx="60" cy="60" r="43" stroke="currentColor" strokeWidth=".7" />
    <circle cx="60" cy="60" r="34" stroke="currentColor" strokeWidth=".45" />
    <path d="M60 8v104M8 60h104M23 23l74 74M97 23 23 97" stroke="currentColor" strokeWidth=".4" />
    <path d="m60 29 8.2 22.8L91 60l-22.8 8.2L60 91l-8.2-22.8L29 60l22.8-8.2L60 29Z" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="60" cy="60" r="9" stroke="currentColor" strokeWidth="1" />
    <circle cx="60" cy="60" r="2" fill="currentColor" />
  </svg>;
}
function ReviewCard({ rows, note }: { rows: [string, string][]; note: string }) {
  return <div className="stage-review"><span className="eyebrow">마지막 확인</span>{rows.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}<p><EyeOff size={15} /> {note}</p></div>;
}
function ActionButton({ label, onClick, busy, secondary = false }: { label: string; onClick: () => void; busy: boolean; secondary?: boolean }) {
  return <button type="button" className={"button " + (secondary ? "secondary" : "primary") + " full stage-action-button"} onClick={onClick} disabled={busy}>{busy ? <span className="spinner" /> : <ArrowRight size={16} />} {label}</button>;
}
export function TextField({ id, label, value, set, max, required, placeholder }: {
  id: string; label: string; value: string; set: (value: string) => void; max: number; required?: boolean; placeholder?: string;
}) {
  return <div className="text-field"><label className="field-label" htmlFor={id}>{label}</label><textarea id={id} value={value} onChange={(e) => set(e.target.value)} maxLength={max} required={required} placeholder={placeholder || "짧고 솔직하게 적어주세요."} rows={3} /><span className="char-count">{value.length} / {max}</span></div>;
}
function AnswerForm({ question, answered, onAnswer, busy }: { question: string; answered?: string; onAnswer: (answer: string) => Promise<unknown>; busy: boolean }) {
  const [text, setText] = useState("");
  const answerId = useId();
  return <div className="answer-card"><p>{question}</p>{answered ? <p className="answer-text">{answered}</p> : <form onSubmit={(e) => { e.preventDefault(); void onAnswer(text); }}><TextField id={answerId} label="나의 답변" value={text} set={setText} max={60} required /><button className="button secondary full" disabled={busy || !text.trim()}>답변 제출 <Send size={15} /></button></form>}</div>;
}
export function RoleCards({ snapshot: s }: { snapshot: Snapshot }) {
  const [index, setIndex] = useState(0);
  const cards = s.me.cards;
  if (!cards?.length) return null;
  const card = cards[Math.min(index, cards.length - 1)];
  return <section className="role-cards stage-role-cards"><div className="small-section-heading"><h3><LockKeyhole size={15} /> 내 관점 카드</h3><span>나만 볼 수 있어요</span></div><article className="stage-private-card" aria-live="polite"><span>{card.label || "비공개 관점 카드"}</span><strong>{card.title}</strong><p>{card.text}</p><small>{String(index + 1).padStart(2, "0")} / {String(cards.length).padStart(2, "0")}</small></article><div className="deck-arrows"><button type="button" onClick={() => setIndex((v) => (v - 1 + cards.length) % cards.length)} aria-label="이전 관점 카드">‹</button><span>카드 {index + 1} / {cards.length}</span><button type="button" onClick={() => setIndex((v) => (v + 1) % cards.length)} aria-label="다음 관점 카드">›</button></div></section>;
}
export function getRoleName(topic: Topic | undefined, id: string | undefined) {
  return topic?.roles.find((r) => r.id === id)?.name || "역할 배정 전";
}
