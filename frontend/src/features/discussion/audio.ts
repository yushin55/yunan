// Microphone samples → short WAV clips cut at pauses, so words are not split between clips.
const TARGET_RATE = 16000;
const MIN_SECONDS = 7;
const MAX_SECONDS = 15;
const PAUSE_MS = 350;
const MIN_VOICED_MS = 400;
const QUIETEST = 0.006;

/** Cuts the stream at pauses and drops clips with no voice (the transcriber invents words for silence). */
export class Chunker {
  private frames: Float32Array[] = [];
  private samples = 0;
  private voicedMs = 0;
  private silentMs = 0;
  private floor = 0.02;

  constructor(
    private rate: number,
    private onClip: (frames: Float32Array[]) => void,
  ) {}

  /** Returns the input level, 0 to 1. */
  push(frame: Float32Array) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    // Follow the room's background noise: fall quickly, rise slowly.
    this.floor = rms < this.floor ? rms : this.floor * 1.002;
    const voiced = rms > Math.max(QUIETEST, this.floor * 2.5);
    const ms = (frame.length / this.rate) * 1000;
    this.voicedMs += voiced ? ms : 0;
    this.silentMs = voiced ? 0 : this.silentMs + ms;
    this.frames.push(frame);
    this.samples += frame.length;
    const seconds = this.samples / this.rate;
    if (seconds >= MAX_SECONDS || (seconds >= MIN_SECONDS && this.silentMs >= PAUSE_MS)) this.flush();
    return Math.min(1, rms * 6);
  }

  flush() {
    if (this.voicedMs >= MIN_VOICED_MS) this.onClip(this.frames);
    this.frames = [];
    this.samples = 0;
    this.voicedMs = 0;
    this.silentMs = 0;
  }
}

function downsample(frames: Float32Array[], from: number) {
  const total = frames.reduce((sum, f) => sum + f.length, 0);
  const ratio = from / TARGET_RATE;
  const out = new Int16Array(Math.floor(total / ratio));
  let frame = 0;
  let index = 0;
  for (let i = 0; i < out.length; i++) {
    // Average the samples this output sample covers.
    const end = Math.floor((i + 1) * ratio);
    const start = Math.floor(i * ratio);
    let sum = 0;
    for (let n = start; n < end; n++) {
      while (index >= frames[frame].length) {
        frame += 1;
        index = 0;
      }
      sum += frames[frame][index++];
    }
    const value = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return out;
}

/** Mono 16-bit 16 kHz WAV as Base64: small enough for one request and readable by the transcriber. */
export function wavBase64(frames: Float32Array[], rate: number) {
  const pcm = downsample(frames, rate);
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
