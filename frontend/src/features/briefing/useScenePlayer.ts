import { useCallback, useEffect, useRef, useState } from "react";
import audioData from "../../data/briefingAudio.json";

export interface Clip {
  lines: string[];
  file: string;
  seconds: number;
  mouth: string;
}
export interface PlayerScene {
  title: string;
  lines: string[];
}

const AUDIO = audioData as Record<string, Record<string, Clip>>;
const MOUTH_STEP = 0.08;

/** Narration recorded for this exact scene text, if any (see scripts/generate-briefing-audio.py). */
function clipFor(key: string, index: number, lines: string[]): Clip | undefined {
  const clip = AUDIO[key]?.[String(index)];
  return clip && clip.lines.join("\n") === lines.join("\n") ? clip : undefined;
}
/** Without a recording, give each caption enough time to be read. */
const estimate = (lines: string[]) => lines.reduce((sum, line) => sum + Math.max(2.8, 0.9 + line.length * 0.08), 0);

/** Which caption is on screen at time t: lines share the clip in proportion to their length. */
function lineAt(lines: string[], seconds: number, t: number) {
  const total = lines.reduce((sum, l) => sum + l.length, 0);
  let edge = 0;
  for (let i = 0; i < lines.length; i++) {
    edge += (lines[i].length / total) * seconds;
    if (t < edge) return i;
  }
  return lines.length - 1;
}

/**
 * Plays a narrated, captioned scene sequence. One pre-recorded clip per scene drives captions
 * and mouth movement; without a clip (or if playback is blocked) a timer keeps the same pacing.
 */
export function useScenePlayer({ audioKey, scenes, introSeconds = 0, onFinish }: { audioKey: string; scenes: PlayerScene[]; introSeconds?: number; onFinish?: () => void }) {
  const [started, setStarted] = useState(false);
  const [intro, setIntro] = useState(introSeconds > 0);
  const [scene, setScene] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [sound, setSound] = useState(true);
  // Bumped on every seek so playback restarts from the new spot even within the same scene.
  const [seekCount, setSeekCount] = useState(0);
  const finished = useRef(false);
  // Parents pass a fresh callback each render; keep playback from restarting because of it.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const audio = useRef<HTMLAudioElement | null>(null);
  // Where the current scene resumes: 0 for a new scene, the paused position after a pause.
  const resumeAt = useRef(0);
  const tRef = useRef(0);
  tRef.current = t;
  const current = scenes[scene];
  const clip = clipFor(audioKey, scene, current.lines);
  const length = clip?.seconds ?? estimate(current.lines);
  const line = lineAt(current.lines, length, t);
  const mouth = clip ? Number(clip.mouth[Math.floor(t / MOUTH_STEP)] ?? 0) : playing && !intro ? Math.round(2 + Math.sin(t * 18) * 2) : 0;
  const lengths = scenes.map((s, i) => clipFor(audioKey, i, s.lines)?.seconds ?? estimate(s.lines));
  const totalSeconds = introSeconds + lengths.reduce((a, b) => a + b, 0);
  const elapsed = ended ? totalSeconds : intro ? 0 : introSeconds + lengths.slice(0, scene).reduce((a, b) => a + b, 0) + t;

  const finish = useCallback(() => {
    audio.current?.pause();
    setPlaying(false);
    setEnded(true);
    if (!finished.current) {
      finished.current = true;
      onFinishRef.current?.();
    }
  }, []);

  const goScene = useCallback(
    (next: number) => {
      audio.current?.pause();
      resumeAt.current = 0;
      setIntro(false);
      setT(0);
      if (next >= scenes.length) finish();
      else setScene(Math.max(0, next));
    },
    [scenes.length, finish],
  );

  // Opening title card.
  useEffect(() => {
    if (!started || !intro || !playing) return;
    const timer = setTimeout(() => setIntro(false), introSeconds * 1000);
    return () => clearTimeout(timer);
  }, [started, intro, playing, introSeconds]);

  useEffect(() => {
    if (!started || intro || ended || !playing) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    // The short pause before the next scene; cancelled if the viewer seeks or skips meanwhile.
    let advance: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const from = resumeAt.current;
    const startClock = () => {
      const began = performance.now() - from * 1000;
      timer = setInterval(() => {
        if (stopped) return;
        const now = (performance.now() - began) / 1000;
        if (now >= length + 0.5) {
          stopped = true;
          goScene(scene + 1);
        } else setT(now);
      }, 80);
    };
    if (clip) {
      const el = new Audio(clip.file);
      audio.current = el;
      el.muted = !sound;
      el.currentTime = Math.min(from, clip.seconds);
      // Ten updates a second are plenty for captions and mouths, and keep the page responsive.
      const follow = () => {
        timer = setInterval(() => !stopped && setT(el.currentTime), 100);
      };
      el.onended = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        advance = setTimeout(() => goScene(scene + 1), 500);
      };
      el.play().then(follow, () => !stopped && startClock());
      return () => {
        stopped = true;
        clearInterval(timer);
        clearTimeout(advance);
        el.pause();
      };
    }
    startClock();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // `sound` only sets the initial mute; the effect below follows later changes.
  }, [started, intro, ended, playing, scene, clip, length, goScene, seekCount]);

  useEffect(() => {
    if (audio.current) audio.current.muted = !sound;
  }, [sound]);
  useEffect(() => () => audio.current?.pause(), []);

  return {
    started,
    intro,
    scene,
    t,
    line,
    text: current.lines[line],
    clip,
    mouth,
    playing,
    ended,
    sound,
    setSound,
    elapsed,
    totalSeconds,
    goScene,
    /** Jump to the end screen; counts as watched. */
    skip: finish,
    /** Jump to a moment on the overall timeline (seconds from the very start). */
    seek: (seconds: number) => {
      audio.current?.pause();
      let rest = Math.max(0, seconds - introSeconds);
      let index = 0;
      while (index < lengths.length - 1 && rest >= lengths[index]) {
        rest -= lengths[index];
        index += 1;
      }
      rest = Math.min(rest, Math.max(0, lengths[index] - 0.2));
      resumeAt.current = rest;
      setIntro(false);
      setEnded(false);
      setScene(index);
      setT(rest);
      setPlaying(true);
      setSeekCount((n) => n + 1);
    },
    start: () => {
      setStarted(true);
      setPlaying(true);
    },
    togglePlay: () => {
      if (playing) resumeAt.current = tRef.current;
      setPlaying(!playing);
    },
    restart: () => {
      finished.current = true; // Already counted as watched.
      resumeAt.current = 0;
      setEnded(false);
      setIntro(introSeconds > 0);
      setScene(0);
      setT(0);
      setPlaying(true);
    },
  };
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
