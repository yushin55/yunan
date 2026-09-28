import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Volume2, VolumeX } from "../common/Icon";
import topicData from "../../data/topics.json";
export default function Header() {
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const loc = useLocation();
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  function toggle() {
    if (sound) {
      void audio.current?.suspend();
      setSound(false);
      return;
    }
    if (!audio.current) {
      const ctx = new AudioContext();
      audio.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0.013;
      gain.connect(ctx.destination);
      [130.81, 196, 261.63].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.65 : 0.2;
        o.connect(g);
        g.connect(gain);
        o.start();
      });
    }
    void audio.current.resume();
    setSound(true);
  }
  return (
    <header className="header">
      <Link to="/" className="brand" aria-label="유난 홈">
        <span className="brand-mark">
          유난<span>.</span>
        </span>
        <span className="brand-sub">반대편의 변호인</span>
      </Link>
      <nav className="top-nav" aria-label="주 메뉴">
        <a href={loc.pathname === "/" ? "#about" : "/#about"}>게임 소개</a>
        <a href={loc.pathname === "/" ? "#how" : "/#how"}>플레이 방법</a>
        <a href={loc.pathname === "/" ? "#topics" : "/#topics"}>
          주제 팩 <span className="tiny-badge">{topicData.length}</span>
        </a>
      </nav>
      <div className="header-actions">
        <button
          className="icon-button sound-toggle"
          onClick={toggle}
          aria-label={sound ? "배경음 끄기" : "배경음 켜기"}
          title={sound ? "배경음 끄기" : "배경음 켜기"}
        >
          {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>
        <a href="/#how" className="guide-link">
          처음이신가요? <ArrowUpRight size={15} />
        </a>
      </div>
    </header>
  );
}
