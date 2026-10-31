import { useRef } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { Briefing } from "../../types/game";
import { Person, playSting } from "./media";
import TopicArt from "./TopicArt";
import { clock, useScenePlayer } from "./useScenePlayer";

const INTRO_SECONDS = 2.6;

type Shot = "anchor" | "footage" | "voices" | "closing";
function shotFor(index: number, total: number): Shot {
  if (index === 0) return "anchor";
  if (index === total - 1) return "closing";
  if (index === total - 2) return "voices";
  return "footage";
}
const LABELS: Record<Shot, string> = { anchor: "오늘의 이슈", footage: "이슈 체크", voices: "현장 목소리", closing: "오늘의 질문" };

/**
 * The pre-game issue briefing as a short TV-news segment: an opening sting, an anchor in the
 * studio, illustrated footage of the issue, reenacted street voices and a closing question.
 * Narration comes from pre-recorded clips; the content only from the topic's cited briefing.
 */
export default function IssueBriefing({ briefing, topicId, headline, onFinish }: { briefing: Briefing; topicId?: string; headline?: string; onFinish?: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const scenes = briefing.scenes;
  const player = useScenePlayer({ audioKey: topicId ?? "", scenes, introSeconds: INTRO_SECONDS, onFinish });
  const { scene, line, text, mouth, intro, playing, sound, elapsed, totalSeconds } = player;
  const current = scenes[scene];
  const quoted = text.startsWith("“");
  const shot = shotFor(scene, scenes.length);
  const title = scene === 0 && headline ? headline : current.title;
  const sourceFor = (id: string) => briefing.sources.find((s) => s.id === id);
  const cites = (current.sourceIds ?? []).map(sourceFor).filter(Boolean);
  const ticker = [...scenes.map((s) => s.title), ...briefing.sources.map((s) => `${s.publisher} ${s.date}`)].join("   ·   ");
  const quotes = current.lines.filter((l) => l.startsWith("“"));
  const speakerIndex = quoted ? quotes.indexOf(text) : -1;

  if (!player.started)
    return (
      <div className="news" data-testid="briefing">
        <button
          className="news-poster"
          data-testid="briefing-play"
          onClick={() => {
            player.start();
            if (sound) playSting();
          }}
        >
          <TopicArt topicId={topicId} shot={0} />
          <span className="news-poster-shade" />
          <span className="news-logo">
            BRIDGE <b>NEWS</b>
          </span>
          <span className="play-disc">
            <Play size={30} aria-hidden />
          </span>
          <strong>이슈 브리핑 영상 보기</strong>
          <span>최근 어떤 논란이 있었는지 뉴스로 전해 드려요 · {clock(totalSeconds)}</span>
        </button>
      </div>
    );

  if (player.ended)
    return (
      <div className="news ended" data-testid="briefing">
        <div className="briefing-end">
          <span className="news-logo small">
            BRIDGE <b>NEWS</b>
          </span>
          <strong>브리핑이 끝났어요. 이제 역할을 고를 차례예요.</strong>
          <p className="muted small">
            {briefing.note} (기준: {briefing.asOf})
          </p>
          <ul className="briefing-sources">
            {briefing.sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.publisher} · {s.title} <ExternalLink size={12} aria-hidden />
                </a>
                <span className="muted small"> {s.date}</span>
              </li>
            ))}
          </ul>
          <button
            className="button ghost small"
            onClick={() => {
              player.restart();
              if (sound) playSting();
            }}
          >
            <RotateCcw size={15} /> 다시 보기
          </button>
        </div>
      </div>
    );

  return (
    <div className="news" data-testid="briefing" ref={frame}>
      <div className={`news-frame shot-${intro ? "intro" : shot}`}>
        {intro ? (
          <div className="news-intro">
            <i className="bar b1" />
            <i className="bar b2" />
            <i className="bar b3" />
            <span className="news-logo big">
              BRIDGE <b>NEWS</b>
            </span>
            <span className="news-intro-sub">이슈 브리핑</span>
          </div>
        ) : (
          <div className="news-cut" key={scene}>
            {(shot === "anchor" || shot === "closing") && (
              <>
                <div className="news-studio" aria-hidden>
                  <i className="beam one" />
                  <i className="beam two" />
                </div>
                <div className="news-wall">
                  <TopicArt topicId={topicId} shot={2} />
                  <span className="news-wall-title">{shot === "closing" ? "오늘의 질문" : title}</span>
                </div>
                <Person mouth={mouth} look={0} className="news-anchor" />
                <div className="news-desk" aria-hidden />
              </>
            )}
            {shot === "footage" && (
              <>
                <TopicArt topicId={topicId} shot={scene} />
                <span className="news-tag-footage">자료 화면 · 이해를 돕기 위한 그림</span>
              </>
            )}
            {shot === "voices" && (
              <>
                <div className="news-voices-bg">
                  <TopicArt topicId={topicId} shot={1} />
                </div>
                <span className="news-tag-footage">현장 목소리 · 보도 내용 요약, 리포터 재연</span>
                <div className="news-voices">
                  {quotes.map((q, i) => (
                    <div key={q} className={`news-voice${i === speakerIndex ? " speaking" : ""}`}>
                      <Person mouth={i === speakerIndex ? mouth : 0} look={i + 1} />
                      <span>의견 {i + 1}</span>
                    </div>
                  ))}
                </div>
                {!quoted && <Person mouth={mouth} look={0} className="news-anchor small" />}
              </>
            )}
            <strong className="sr-only" data-testid="briefing-headline">
              {title}
            </strong>
            <div className="news-bug">
              <span className="news-logo small">
                BRIDGE <b>NEWS</b>
              </span>
              <span className="news-live">
                <i className="rec" /> {LABELS[shot]}
              </span>
            </div>
            <div className={`news-lower${quoted ? " quote" : ""}`} key={`l${line}`} aria-live="polite">
              <span className="news-lower-title">{quoted ? `의견 ${speakerIndex + 1} · 재연` : title}</span>
              <p>{text}</p>
              {cites.length > 0 && !quoted && <small>자료: {cites.map((s) => s!.publisher).join(", ")}</small>}
            </div>
          </div>
        )}
        <div className="news-ticker" aria-hidden>
          <span className="news-ticker-tag">ISSUE</span>
          <div className="news-ticker-track">
            <span>{ticker}</span>
            <span>{ticker}</span>
          </div>
        </div>
      </div>
      <PlayerControls player={player} frame={frame} note="실제 보도 요약 · AI 합성 음성 · 출처는 끝에" elapsed={elapsed} total={totalSeconds} playing={playing} />
    </div>
  );
}

export function PlayerControls({
  player,
  frame,
  note,
  elapsed,
  total,
  playing,
}: {
  player: ReturnType<typeof useScenePlayer>;
  frame: React.RefObject<HTMLDivElement | null>;
  note: string;
  elapsed: number;
  total: number;
  playing: boolean;
}) {
  return (
    <div className="news-controls">
      <div className="news-scrub" aria-hidden>
        <i style={{ width: `${(elapsed / total) * 100}%` }} />
      </div>
      <div className="news-buttons">
        <button className="icon-button" onClick={() => player.goScene(player.scene - 1)} disabled={player.intro || player.scene === 0} aria-label="이전 장면">
          <ChevronLeft size={18} />
        </button>
        <button className="icon-button" onClick={player.togglePlay} aria-label={playing ? "일시정지" : "재생"}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="icon-button" data-testid="briefing-next" onClick={() => player.goScene(player.intro ? 0 : player.scene + 1)} aria-label="다음 장면">
          <ChevronRight size={18} />
        </button>
        <button className="icon-button" onClick={() => player.setSound((v) => !v)} aria-pressed={player.sound} aria-label={player.sound ? "소리 끄기" : "소리 켜기"} title={player.sound ? "소리 끄기" : "소리 켜기"}>
          {player.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <span className="news-time">
          {clock(elapsed)} / {clock(total)}
        </span>
        <span className="muted small news-note">{note}</span>
        <button className="icon-button" onClick={() => void frame.current?.requestFullscreen?.()} aria-label="전체 화면" title="전체 화면">
          <Maximize2 size={17} />
        </button>
      </div>
    </div>
  );
}
