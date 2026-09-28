import { useCallback, useEffect, useRef, useState } from "react";
import narrationClips from "../data/narration.json";

export type GameAudioCue =
  | "topic"
  | "role"
  | "reveal"
  | "transition"
  | "deal"
  | "select"
  | "confirm"
  | "tick";

const STORAGE_KEY = "yunan:game-audio";
const MUSIC_KEY = "yunan:game-music";
const MUSIC_LEVEL = 0.42;
const DUCKED_MUSIC_LEVEL = 0.12;
type Soundtrack = { gain: GainNode; sustained: AudioScheduledSourceNode[]; interval: number; nodes: AudioNode[] };

const CUES: Record<GameAudioCue, { notes: [number, number, number][]; wave: OscillatorType }> = {
  topic: { notes: [[130.81, 0, 0.44], [196, 0.14, 0.5], [311.13, 0.34, 0.78]], wave: "sine" },
  role: { notes: [[164.81, 0, 0.38], [246.94, 0.2, 0.46], [329.63, 0.42, 0.7]], wave: "sine" },
  reveal: { notes: [[146.83, 0, 0.38], [220, 0.16, 0.52], [349.23, 0.37, 0.76]], wave: "triangle" },
  transition: { notes: [[196, 0, 0.2], [293.66, 0.17, 0.35]], wave: "sine" },
  deal: { notes: [[110, 0, 0.22], [98, 0.17, 0.22], [82.41, 0.34, 0.3]], wave: "triangle" },
  select: { notes: [[440, 0, 0.12]], wave: "sine" },
  confirm: { notes: [[392, 0, 0.16], [523.25, 0.12, 0.26]], wave: "sine" },
  tick: { notes: [[1318.5, 0, 0.07]], wave: "square" },
};

/**
 * Game-show host treatment for the narration: a slightly lowered, compressed voice with a
 * faint ring-modulated metallic layer, a shimmering chorus and a short announcer-hall slap.
 * The dry voice stays dominant so every word remains clear.
 */
const VOICE_FX = {
  detuneCents: -70,
  ringHz: 46,
  ringMix: 0.16,
  chorusMix: 0.28,
  slapSeconds: 0.094,
  slapMix: 0.17,
};

function createHostVoiceChain(context: AudioContext, destination: AudioNode) {
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  const add = <T extends AudioNode>(node: T) => { nodes.push(node); return node; };

  const input = add(context.createGain());
  const bass = add(context.createBiquadFilter());
  bass.type = "lowshelf";
  bass.frequency.value = 190;
  bass.gain.value = 4.5;
  const boxy = add(context.createBiquadFilter());
  boxy.type = "peaking";
  boxy.frequency.value = 420;
  boxy.Q.value = 1.1;
  boxy.gain.value = -2.5;
  const presence = add(context.createBiquadFilter());
  presence.type = "peaking";
  presence.frequency.value = 2600;
  presence.Q.value = 0.9;
  presence.gain.value = 3;
  const air = add(context.createBiquadFilter());
  air.type = "lowpass";
  air.frequency.value = 6800;
  const drive = add(context.createWaveShaper());
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
  }
  drive.curve = curve;
  drive.oversample = "2x";
  input.connect(bass);
  bass.connect(boxy);
  boxy.connect(presence);
  presence.connect(air);
  air.connect(drive);

  const bus = add(context.createGain());
  const compressor = add(context.createDynamicsCompressor());
  compressor.threshold.value = -24;
  compressor.knee.value = 8;
  compressor.ratio.value = 3.4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;
  const level = add(context.createGain());
  level.gain.value = 1.2;
  bus.connect(compressor);
  compressor.connect(level);
  level.connect(destination);

  const dry = add(context.createGain());
  dry.gain.value = 0.9;
  drive.connect(dry);
  dry.connect(bus);

  // Ring modulation: multiplies the voice by a low sine for the synthetic "system" edge.
  const ringBand = add(context.createBiquadFilter());
  ringBand.type = "bandpass";
  ringBand.frequency.value = 1500;
  ringBand.Q.value = 0.6;
  const ring = add(context.createGain());
  ring.gain.value = 0;
  const carrier = context.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = VOICE_FX.ringHz;
  carrier.connect(ring.gain);
  carrier.start();
  sources.push(carrier);
  nodes.push(carrier);
  const ringMix = add(context.createGain());
  ringMix.gain.value = VOICE_FX.ringMix;
  drive.connect(ringBand);
  ringBand.connect(ring);
  ring.connect(ringMix);
  ringMix.connect(bus);

  // Chorus: a short, slowly moving delay adds a doubled, slightly phased sheen.
  const chorus = add(context.createDelay(0.05));
  chorus.delayTime.value = 0.017;
  const wobble = context.createOscillator();
  const wobbleDepth = add(context.createGain());
  wobble.frequency.value = 0.42;
  wobbleDepth.gain.value = 0.0035;
  wobble.connect(wobbleDepth);
  wobbleDepth.connect(chorus.delayTime);
  wobble.start();
  sources.push(wobble);
  nodes.push(wobble);
  const chorusTone = add(context.createBiquadFilter());
  chorusTone.type = "highpass";
  chorusTone.frequency.value = 260;
  const chorusMix = add(context.createGain());
  chorusMix.gain.value = VOICE_FX.chorusMix;
  drive.connect(chorus);
  chorus.connect(chorusTone);
  chorusTone.connect(chorusMix);
  chorusMix.connect(bus);

  // Announcer-hall slap: one filtered repeat with light feedback.
  const slap = add(context.createDelay(0.5));
  slap.delayTime.value = VOICE_FX.slapSeconds;
  const slapFeedback = add(context.createGain());
  slapFeedback.gain.value = 0.26;
  const slapTone = add(context.createBiquadFilter());
  slapTone.type = "bandpass";
  slapTone.frequency.value = 1300;
  slapTone.Q.value = 0.5;
  const slapMix = add(context.createGain());
  slapMix.gain.value = VOICE_FX.slapMix;
  drive.connect(slap);
  slap.connect(slapTone);
  slapTone.connect(slapFeedback);
  slapFeedback.connect(slap);
  slapTone.connect(slapMix);
  slapMix.connect(bus);

  return {
    input,
    /** Seconds the slap tail keeps ringing after the voice ends. */
    tail: 0.7,
    dispose: () => {
      sources.forEach((source) => { try { source.stop(); } catch { /* Already stopped. */ } });
      nodes.forEach((node) => node.disconnect());
    },
  };
}

/** A brief digital "channel open" chirp before the host speaks. */
function hostChirp(context: AudioContext, when: number) {
  const tone = context.createOscillator();
  const band = context.createBiquadFilter();
  const envelope = context.createGain();
  tone.type = "square";
  tone.frequency.setValueAtTime(1760, when);
  tone.frequency.exponentialRampToValueAtTime(880, when + 0.09);
  band.type = "bandpass";
  band.frequency.value = 1400;
  band.Q.value = 2.2;
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(0.03, when + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
  tone.connect(band);
  band.connect(envelope);
  envelope.connect(context.destination);
  tone.onended = () => { tone.disconnect(); band.disconnect(); envelope.disconnect(); };
  tone.start(when);
  tone.stop(when + 0.18);
}

function available() {
  return typeof window !== "undefined" &&
    ("speechSynthesis" in window || "AudioContext" in window);
}

function savedPreference(key = STORAGE_KEY) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

/** Sound is primed by a real click/key press; phase updates can then play later. */
export function useGameAudio() {
  const [enabled, setEnabled] = useState(() => available() && savedPreference());
  const [musicEnabled, setMusicEnabled] = useState(() => available() && savedPreference(MUSIC_KEY));
  const supported = available();
  const musicSupported = typeof window !== "undefined" && "AudioContext" in window;
  const enabledRef = useRef(enabled);
  const musicEnabledRef = useRef(musicEnabled);
  const unlockedRef = useRef(false);
  const contextRef = useRef<AudioContext | null>(null);
  const soundtrackRef = useRef<Soundtrack | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const primingRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recordedVoiceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceRequestRef = useRef(0);
  const clipCacheRef = useRef(new Map<string, Promise<AudioBuffer>>());
  const pendingVoiceTimerRef = useRef<number | null>(null);
  const pendingVoiceListenerRef = useRef<(() => void) | null>(null);

  const clearPendingVoice = useCallback(() => {
    if (pendingVoiceTimerRef.current !== null) {
      window.clearTimeout(pendingVoiceTimerRef.current);
      pendingVoiceTimerRef.current = null;
    }
    if (pendingVoiceListenerRef.current && "speechSynthesis" in window) {
      window.speechSynthesis.removeEventListener("voiceschanged", pendingVoiceListenerRef.current);
      pendingVoiceListenerRef.current = null;
    }
  }, []);

  const stopMusic = useCallback(() => {
    const soundtrack = soundtrackRef.current;
    if (!soundtrack) return;
    soundtrackRef.current = null;
    window.clearInterval(soundtrack.interval);
    const context = contextRef.current;
    if (context && context.state !== "closed") {
      soundtrack.gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.15);
    }
    window.setTimeout(() => {
      soundtrack.sustained.forEach((source) => { try { source.stop(); } catch { /* Already stopped. */ } });
      soundtrack.nodes.forEach((node) => node.disconnect());
      soundtrack.gain.disconnect();
    }, 750);
  }, []);

  const startMusic = useCallback((context: AudioContext) => {
    if (!enabledRef.current || !musicEnabledRef.current || soundtrackRef.current) return;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, context.currentTime + 0.7);
    gain.connect(context.destination);
    const scoreBus = context.createGain();
    const hall = context.createConvolver();
    const hallLevel = context.createGain();
    const impulse = context.createBuffer(2, Math.round(context.sampleRate * 1.45), context.sampleRate);
    let roomSeed = 81437;
    for (let channel = 0; channel < 2; channel++) {
      const room = impulse.getChannelData(channel);
      for (let i = 0; i < room.length; i++) {
        roomSeed = (roomSeed * 16807) % 2147483647;
        room[i] = ((roomSeed / 2147483647) * 2 - 1) * Math.pow(1 - i / room.length, 2.7) * 0.42;
      }
    }
    hall.buffer = impulse;
    hallLevel.gain.value = 0.17;
    scoreBus.connect(gain);
    scoreBus.connect(hall);
    hall.connect(hallLevel);
    hallLevel.connect(gain);

    // Original D-minor dramatic score: brass, low strings, ostinato and drums.
    // All parts are synthesized locally; no music from another game is sampled.
    const sustained: AudioScheduledSourceNode[] = [];
    const droneFilter = context.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 420;
    droneFilter.connect(scoreBus);
    for (const [frequency, volume, wave] of [[73.42, 0.08, "sawtooth"], [110, 0.045, "triangle"]] as const) {
      const oscillator = context.createOscillator();
      const level = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      level.gain.value = volume;
      oscillator.connect(level);
      level.connect(droneFilter);
      oscillator.start();
      sustained.push(oscillator);
    }
    const hiss = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = hiss.getChannelData(0);
    let seed = 24779;
    for (let i = 0; i < samples.length; i++) {
      seed = (seed * 16807) % 2147483647;
      samples[i] = (seed / 2147483647) * 2 - 1;
    }
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseLevel = context.createGain();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 220;
    noiseLevel.gain.value = 0.009;
    noise.buffer = hiss;
    noise.loop = true;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseLevel);
    noiseLevel.connect(scoreBus);
    noise.start();
    sustained.push(noise);

    const tone = (frequency: number, when: number, duration: number, amplitude: number,
      wave: OscillatorType, cutoff: number, attack = 0.045, detune = 0) => {
      const oscillator = context.createOscillator();
      const voiceFilter = context.createBiquadFilter();
      const envelope = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      voiceFilter.type = "lowpass";
      voiceFilter.frequency.value = cutoff;
      envelope.gain.setValueAtTime(0.0001, when);
      envelope.gain.exponentialRampToValueAtTime(amplitude, when + attack);
      envelope.gain.setValueAtTime(amplitude, when + Math.max(attack, duration - 0.22));
      envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      oscillator.connect(voiceFilter);
      voiceFilter.connect(envelope);
      envelope.connect(scoreBus);
      oscillator.onended = () => { oscillator.disconnect(); voiceFilter.disconnect(); envelope.disconnect(); };
      oscillator.start(when);
      oscillator.stop(when + duration + 0.02);
    };
    const drum = (when: number, heavy: boolean) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(heavy ? 125 : 105, when);
      oscillator.frequency.exponentialRampToValueAtTime(heavy ? 52 : 64, when + 0.36);
      envelope.gain.setValueAtTime(0.0001, when);
      envelope.gain.exponentialRampToValueAtTime(heavy ? 0.32 : 0.19, when + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.65);
      oscillator.connect(envelope);
      envelope.connect(scoreBus);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(when);
      oscillator.stop(when + 0.67);
      const strike = context.createBufferSource();
      const strikeFilter = context.createBiquadFilter();
      const strikeLevel = context.createGain();
      strike.buffer = hiss;
      strikeFilter.type = "bandpass";
      strikeFilter.frequency.value = heavy ? 280 : 480;
      strikeFilter.Q.value = 0.8;
      strikeLevel.gain.setValueAtTime(heavy ? 0.15 : 0.09, when);
      strikeLevel.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
      strike.connect(strikeFilter);
      strikeFilter.connect(strikeLevel);
      strikeLevel.connect(scoreBus);
      strike.onended = () => { strike.disconnect(); strikeFilter.disconnect(); strikeLevel.disconnect(); };
      strike.start(when);
      strike.stop(when + 0.23);
    };
    const harmony = [
      { bass: 73.42, chord: [146.83, 174.61, 220], pattern: [293.66, 220, 349.23, 220] },
      { bass: 58.27, chord: [116.54, 174.61, 293.66], pattern: [293.66, 233.08, 349.23, 233.08] },
      { bass: 49, chord: [98, 146.83, 233.08], pattern: [293.66, 196, 349.23, 196] },
      { bass: 55, chord: [110, 164.81, 277.18], pattern: [277.18, 220, 329.63, 220] },
    ];
    let bar = 0;
    const playBar = () => {
      if (context.state === "closed") return;
      const now = context.currentTime + 0.04;
      const part = harmony[bar % harmony.length];
      drum(now, true);
      drum(now + 1.25, false);
      tone(part.bass, now, 2.36, 0.13, "sawtooth", 350, 0.16);
      for (const pitch of part.chord) {
        tone(pitch, now, 2.37, 0.065, "sawtooth", 680, 0.24);
        tone(pitch, now, 2.34, 0.035, "triangle", 1100, 0.3, -7);
      }
      tone(part.bass * 2, now, 0.73, 0.18, "sawtooth", 470, 0.04);
      tone(part.chord[1], now, 0.73, 0.11, "sawtooth", 600, 0.05);
      for (let pulse = 0; pulse < 8; pulse++) {
        tone(part.pattern[pulse % 4], now + pulse * 0.3125, 0.21,
          pulse % 4 === 0 ? 0.13 : 0.085, "sawtooth", 1400, 0.014);
      }
      if (bar % 4 === 3) {
        const swell = context.createBufferSource();
        const sweep = context.createBiquadFilter();
        const swellLevel = context.createGain();
        swell.buffer = hiss;
        sweep.type = "bandpass";
        sweep.Q.value = 0.7;
        sweep.frequency.setValueAtTime(240, now + 1.45);
        sweep.frequency.exponentialRampToValueAtTime(1050, now + 2.42);
        swellLevel.gain.setValueAtTime(0.0001, now + 1.45);
        swellLevel.gain.exponentialRampToValueAtTime(0.085, now + 2.34);
        swellLevel.gain.exponentialRampToValueAtTime(0.0001, now + 2.49);
        swell.connect(sweep);
        sweep.connect(swellLevel);
        swellLevel.connect(scoreBus);
        swell.onended = () => { swell.disconnect(); sweep.disconnect(); swellLevel.disconnect(); };
        swell.start(now + 1.45);
        swell.stop(now + 2.5);
      }
      bar++;
    };
    playBar();
    soundtrackRef.current = {
      gain, sustained, interval: window.setInterval(playBar, 2500),
      nodes: [scoreBus, hall, hallLevel, droneFilter, noiseFilter, noiseLevel],
    };
  }, []);

  const stop = useCallback(() => {
    voiceRequestRef.current++;
    clearPendingVoice();
    const recordedVoice = recordedVoiceRef.current;
    recordedVoiceRef.current = null;
    if (recordedVoice) {
      try { recordedVoice.stop(); } catch { /* Already stopped. */ }
      recordedVoice.disconnect();
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window && (utteranceRef.current || primingRef.current)) {
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
      primingRef.current = null;
    }
    const soundtrack = soundtrackRef.current;
    const context = contextRef.current;
    if (soundtrack && context && context.state !== "closed") {
      soundtrack.gain.gain.setTargetAtTime(MUSIC_LEVEL, context.currentTime, 0.35);
    }
  }, [clearPendingVoice]);

  const unlock = useCallback(() => {
    if (typeof window === "undefined") return;
    const firstGesture = !unlockedRef.current;
    unlockedRef.current = true;

    // Creating/resuming the context inside a user gesture is required on mobile.
    if ("AudioContext" in window && enabledRef.current) {
      try {
        const context = contextRef.current ?? new AudioContext();
        contextRef.current = context;
        if (context.state === "suspended") void context.resume().catch(() => {});
        startMusic(context);
      } catch {
        // Web Speech can still work when Web Audio is unavailable.
      }
    }

    // Some mobile browsers require the speech engine to be touched by a gesture.
    if ("speechSynthesis" in window && enabledRef.current) {
      try {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.resume();
        if (firstGesture && "SpeechSynthesisUtterance" in window) {
          const primer = new SpeechSynthesisUtterance(" ");
          primer.lang = "ko-KR";
          primer.volume = 0;
          primer.onend = () => { if (primingRef.current === primer) primingRef.current = null; };
          primer.onerror = () => { if (primingRef.current === primer) primingRef.current = null; };
          primingRef.current = primer;
          window.speechSynthesis.speak(primer);
        }
      } catch {
        // The game remains playable without sound.
      }
    }
  }, [startMusic]);

  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Private browsing can disable storage.
    }
    if (next) unlock();
    else { stop(); stopMusic(); }
  }, [stop, stopMusic, unlock]);

  const toggleMusic = useCallback(() => {
    const next = !musicEnabledRef.current;
    musicEnabledRef.current = next;
    setMusicEnabled(next);
    try { window.localStorage.setItem(MUSIC_KEY, next ? "on" : "off"); } catch { /* Storage can be disabled. */ }
    if (next) unlock();
    else stopMusic();
  }, [stopMusic, unlock]);

  const playCue = useCallback((cue: GameAudioCue) => {
    if (!enabledRef.current || !unlockedRef.current || typeof window === "undefined") return;
    const context = contextRef.current;
    if (!context || context.state === "closed") return;

    const schedule = () => {
      const now = context.currentTime + 0.015;
      for (const [frequency, delay, duration] of CUES[cue].notes) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = CUES[cue].wave;
        oscillator.frequency.setValueAtTime(frequency, now + delay);
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(cue === "deal" ? 0.19 : cue === "select" ? 0.045 : cue === "tick" ? 0.03 : 0.085, now + delay + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
        if (cue === "deal") oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.56, now + delay + 0.13);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + delay);
        oscillator.stop(now + delay + duration + 0.02);
      }
    };

    if (context.state === "running") schedule();
    else void context.resume().then(schedule).catch(() => {});
  }, []);

  const loadClip = useCallback((context: AudioContext, clip: string) => {
    const cached = clipCacheRef.current.get(clip) ?? (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}audio/narration/${clip}`);
      if (!response.ok) throw new Error(`Narration audio ${response.status}`);
      return context.decodeAudioData(await response.arrayBuffer());
    })();
    clipCacheRef.current.set(clip, cached);
    return cached;
  }, []);

  /** Fetches and decodes a bundled line ahead of time so it starts without a gap. */
  const preloadNarration = useCallback((content: string) => {
    const clip = (narrationClips as Record<string, string>)[content.replace(/\s+/g, " ").trim().slice(0, 320)];
    const context = contextRef.current;
    if (!clip || !context || context.state === "closed") return;
    loadClip(context, clip).catch(() => clipCacheRef.current.delete(clip));
  }, [loadClip]);

  /** Speaks a line. Returns false when nothing will play; `onEnd` fires only if the line finishes naturally. */
  const narrate = useCallback((content: string, options: { onEnd?: () => void } = {}) => {
    if (!enabledRef.current || !unlockedRef.current || typeof window === "undefined") return false;
    const message = content.replace(/\s+/g, " ").trim().slice(0, 320);
    if (!message) return false;
    stop();
    const request = voiceRequestRef.current;
    const finished = () => { if (voiceRequestRef.current === request) options.onEnd?.(); };
    const restoreMusic = () => {
      const music = soundtrackRef.current;
      const context = contextRef.current;
      if (music && context && context.state !== "closed") music.gain.gain.setTargetAtTime(MUSIC_LEVEL, context.currentTime, 0.6);
    };
    const speakInBrowser = () => {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
      const synth = window.speechSynthesis;
      const speak = () => {
      clearPendingVoice();
      if (!enabledRef.current || voiceRequestRef.current !== request) return;
      try {
        const speech = new SpeechSynthesisUtterance(message);
        speech.lang = "ko-KR";
        speech.rate = 0.74;
        speech.pitch = 0.42;
        speech.volume = 1;
        const voices = synth.getVoices();
        const koreanVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ko"));
        speech.voice = koreanVoices.find((voice) => /male|남성|hyunsu|injoon|junwoo|junsu|현수|인준|준우/i.test(voice.name) && !/female|heami|sunhi/i.test(voice.name)) ??
          koreanVoices.find((voice) => voice.lang.toLowerCase() === "ko-kr") ?? koreanVoices[0] ?? null;
        const music = soundtrackRef.current;
        const context = contextRef.current;
        if (music && context && context.state !== "closed") music.gain.gain.setTargetAtTime(DUCKED_MUSIC_LEVEL, context.currentTime, 0.12);
        speech.onend = () => { if (utteranceRef.current === speech) utteranceRef.current = null; restoreMusic(); finished(); };
        speech.onerror = () => { if (utteranceRef.current === speech) utteranceRef.current = null; restoreMusic(); };
        utteranceRef.current = speech;
        synth.speak(speech);
      } catch {
        utteranceRef.current = null;
      }
      };
      // Chromium can report no voices until its asynchronous list loads.
      if (synth.getVoices().length === 0) {
        pendingVoiceListenerRef.current = speak;
        synth.addEventListener("voiceschanged", speak);
        pendingVoiceTimerRef.current = window.setTimeout(speak, 1400);
      } else speak();
    };

    const clip = (narrationClips as Record<string, string>)[message];
    const context = contextRef.current;
    if (!clip || !context || context.state === "closed") { speakInBrowser(); return true; }
    const cached = loadClip(context, clip);
    void (async () => {
      try {
        if (context.state === "suspended") await context.resume();
        const buffer = await cached;
        if (!enabledRef.current || voiceRequestRef.current !== request || context.state === "closed") return;
        const source = context.createBufferSource();
        const chain = createHostVoiceChain(context, context.destination);
        source.buffer = buffer;
        source.detune.value = VOICE_FX.detuneCents;
        source.connect(chain.input);
        const music = soundtrackRef.current;
        if (music) music.gain.gain.setTargetAtTime(DUCKED_MUSIC_LEVEL, context.currentTime, 0.12);
        recordedVoiceRef.current = source;
        source.onended = () => {
          if (recordedVoiceRef.current === source) { recordedVoiceRef.current = null; restoreMusic(); finished(); }
          source.disconnect();
          // Let the slap echo ring out before tearing the effect graph down.
          window.setTimeout(chain.dispose, chain.tail * 1000);
        };
        const start = context.currentTime + 0.02;
        hostChirp(context, start);
        source.start(start + 0.14);
      } catch {
        clipCacheRef.current.delete(clip);
        if (voiceRequestRef.current === request) speakInBrowser();
      }
    })();
    return true;
  }, [clearPendingVoice, loadClip, stop]);

  useEffect(() => {
    // A ready/join click is the usual unlock path; any later interaction also works.
    const onGesture = () => {
      if (enabledRef.current && !unlockedRef.current) unlock();
    };
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
    return () => {
      document.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("keydown", onGesture);
      stop();
      stopMusic();
      const context = contextRef.current;
      if (context && context.state !== "closed") void context.close().catch(() => {});
      contextRef.current = null;
    };
  }, [stop, stopMusic, unlock]);

  return { enabled, supported, musicEnabled, musicSupported, toggle, toggleMusic, unlock, playCue, narrate, preloadNarration, stop };
}
