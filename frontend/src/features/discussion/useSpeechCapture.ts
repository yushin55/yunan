import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api";
import { Chunker, wavBase64 } from "./audio";

/**
 * server: the microphone on this device, clips sent to the game server for transcription (real rooms).
 * browser: the browser's own speech recognition (practice mode, which has no server).
 */
export type SpeechEngine = "server" | "browser";
export type CaptureStatus = "off" | "starting" | "on" | "blocked" | "unsupported" | "error";

const MAX_QUEUE = 12;
// Transcribing a clip can take longer than saying it. Clips go side by side so the record does not
// fall further behind during the lesson; the server puts them back in order by clip number.
const MAX_PARALLEL = 3;

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function recognitionClass() {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function engineSupported(engine: SpeechEngine) {
  if (typeof window === "undefined") return false;
  if (engine === "browser") return Boolean(recognitionClass());
  return typeof navigator.mediaDevices?.getUserMedia === "function" && "AudioWorkletNode" in window;
}

export function useSpeechCapture({
  engine,
  version,
  listening,
  upload,
  onText,
}: {
  engine: SpeechEngine;
  /** The current turn: what is heard now belongs to it, even if it arrives after the floor moved on. */
  version: number;
  listening: boolean;
  upload: (audio: string, version: number, clip: number) => Promise<unknown>;
  onText: (text: string, version: number) => Promise<unknown>;
}) {
  const [status, setStatus] = useState<CaptureStatus>(() => (engineSupported(engine) ? "off" : "unsupported"));
  const [level, setLevel] = useState(0);
  const [interim, setInterim] = useState("");
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  // Why the last clip failed, as the server put it: a broken AI key looks very different from a slow network.
  const [reason, setReason] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  const listeningRef = useRef(listening);
  const versionRef = useRef(version);
  const uploadRef = useRef(upload);
  const textRef = useRef(onText);
  uploadRef.current = upload;
  textRef.current = onText;

  // Set while switched on. A stop during the slow part of a start must still close the microphone.
  const wanted = useRef(false);
  // Recognition can deliver its last words after the microphone is off: they belong to the turn just heard.
  const heardVersion = useRef(version);

  const queue = useRef<{ audio: string; version: number; clip: number }[]>([]);
  const active = useRef(0);
  const clipNumber = useRef(0);
  const drain = useCallback(function run() {
    while (active.current < MAX_PARALLEL && queue.current.length) {
      const clip = queue.current.shift()!;
      active.current += 1;
      setPending(queue.current.length + active.current);
      void (async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await uploadRef.current(clip.audio, clip.version, clip.clip);
            break;
          } catch (e) {
            const retry = e instanceof ApiError && (e.status === 0 || e.status >= 500);
            if (!retry || attempt === 1) {
              setFailed((n) => n + 1);
              setReason((e as Error).message);
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
        active.current -= 1;
        setPending(queue.current.length + active.current);
        run();
      })();
    }
  }, []);

  const chunker = useRef<Chunker | null>(null);
  const clipVersion = useRef(version);
  const flushRef = useRef(() => {});

  // The floor moved or listening stopped: what was heard so far belongs to the previous turn.
  useEffect(() => {
    if (versionRef.current !== version || listeningRef.current !== listening) flushRef.current();
    versionRef.current = version;
    listeningRef.current = listening;
    clipVersion.current = version;
    if (listening) heardVersion.current = version;
    if (!listening) {
      setLevel(0);
      setInterim("");
    }
  }, [version, listening]);

  const startServer = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const context = new AudioContext();
    await context.audioWorklet.addModule("/pcm-capture.worklet.js");
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "pcm-capture");
    // Silent output: a node that goes nowhere may never be run.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(context.destination);
    const rate = context.sampleRate;
    const chunks = new Chunker(rate, (frames) => {
      if (queue.current.length >= MAX_QUEUE) {
        queue.current.shift();
        setFailed((n) => n + 1);
      }
      clipNumber.current += 1;
      queue.current.push({ audio: wavBase64(frames, rate), version: clipVersion.current, clip: clipNumber.current });
      drain();
    });
    chunker.current = chunks;
    flushRef.current = () => chunks.flush();
    let shown = 0;
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (!listeningRef.current) return; // Off-turn and paused audio is dropped here, never kept.
      const value = chunks.push(e.data);
      const now = performance.now();
      if (now - shown > 120) {
        shown = now;
        setLevel(value);
      }
    };
    stream.getAudioTracks()[0]?.addEventListener("ended", () => {
      setStatus("error");
      stopRef.current?.();
    });
    stopRef.current = () => {
      chunks.flush();
      flushRef.current = () => {};
      node.port.onmessage = null;
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      stopRef.current = null;
    };
  }, [drain]);

  const startBrowser = useCallback(() => {
    const Klass = recognitionClass()!;
    let running = true;
    let current: Recognition | null = null;
    const open = () => {
      const r = new Klass();
      r.lang = "ko-KR";
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let partial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript.trim();
          if (e.results[i].isFinal) {
            if (text && (listeningRef.current || !running)) textRef.current(text, heardVersion.current).catch(() => setFailed((n) => n + 1));
          } else partial += text + " ";
        }
        setInterim(listeningRef.current ? partial.trim() : "");
      };
      r.onerror = (e) => {
        // "no-speech" and "aborted" just end the session; it restarts below.
        const fatal = e.error === "not-allowed" || e.error === "service-not-allowed" ? "blocked" : e.error === "network" || e.error === "audio-capture" ? "error" : null;
        if (fatal) {
          running = false;
          stopRef.current = null; // So the student can try again.
          setStatus(fatal);
        }
      };
      r.onend = () => {
        if (running) open();
      };
      current = r;
      r.start();
    };
    open();
    stopRef.current = () => {
      running = false;
      current?.stop();
      stopRef.current = null;
    };
  }, []);

  const close = useCallback(() => stopRef.current?.(), []);

  const start = useCallback(async () => {
    if (stopRef.current || !engineSupported(engine)) return;
    wanted.current = true;
    setStatus("starting");
    try {
      if (engine === "browser") startBrowser();
      else await startServer();
      if (!wanted.current) close();
      else setStatus((s) => (s === "starting" ? "on" : s));
    } catch (e) {
      setStatus((e as DOMException).name === "NotAllowedError" ? "blocked" : "error");
    }
  }, [close, engine, startBrowser, startServer]);

  const stop = useCallback(() => {
    wanted.current = false;
    close();
    setStatus((s) => (s === "unsupported" ? s : "off"));
    setLevel(0);
    setInterim("");
  }, [close]);

  useEffect(() => close, [close]);

  return { status, level, interim, pending, failed, reason, start, stop };
}
