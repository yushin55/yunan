import { useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import Sheet from "../../components/Sheet";
import type { Me, Room, SpeechKind } from "../../types/game";
import { formatSeconds, KIND_LABEL, micKinds, openFloor } from "../game/phases";
import type { RoomApi } from "../room/useRoom";
import { useFloor } from "./floor";
import { LineInput } from "./TranscriptFeed";
import { useSpeechCapture, type SpeechEngine } from "./useSpeechCapture";

const KEYS = ["KeyZ", "KeyX"];
const KEY_NAMES = ["Z", "X"];
// Holding the key this long means push-to-talk: letting go switches off. A quick press stays on.
const HOLD_MS = 1500;
// The room's listener normally reports the microphone is ours well before this.
const CONFIRM_MS = 3000;

const NOTICE: Record<SpeechEngine, string[]> = {
  server: [
    "버튼이나 키를 누르면 내 기기의 마이크가 켜지고, 말이 끝나거나 시간이 다 되면 꺼져요. 켜져 있을 때만 들어요.",
    "음성은 글로 바꾸는 데만 쓰고 저장하지 않아요. 글로 바꾸기 위해 Google Gemini로 전송돼요.",
    "받아쓴 글은 표현 점검을 거쳐 이 게임의 발언 기록으로 남아요. 틀린 부분은 선생님이 고치거나 지울 수 있어요.",
  ],
  browser: ["이 브라우저의 음성 인식 기능을 써요. 브라우저에 따라 음성이 제조사 서버로 전송될 수 있어요.", "마이크가 켜져 있을 때만 들어요. 받아쓴 글은 이 브라우저에만 저장돼요."],
};

function noticeAlreadyRead(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function rememberNotice(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* It just asks again next time. */
  }
}

/** Typing in the memo must not grab the microphone. */
function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * The one microphone in the room. Z (or the first button) speaks for the phase and X (or the second)
 * answers. The server hands it to one person at a time; everyone else's buttons wait until it is free.
 */
export default function MicControls({ room, me, api, engine, allowTyping }: { room: Room; me: Me; api: RoomApi; engine: SpeechEngine; allowTyping?: boolean }) {
  const { action, quiet, busy, offset } = api;
  const { floor, seconds } = useFloor(room, offset);
  const kinds = micKinds(room);
  const open = openFloor(room);
  const mine = floor?.uid === me.uid;
  const listening = mine && !room.paused;
  const myTurn = room.turn?.uid === me.uid;
  const capture = useSpeechCapture({
    engine,
    version: floor?.version ?? room.phaseVersion,
    listening,
    upload: (audio, version, clip) => quiet("speech", { audio, mimeType: "audio/wav", phaseVersion: version, clip }),
    onText: (text, version) => quiet("line-add", { text, phaseVersion: version }),
  });
  const { status, start, stop } = capture;
  const [claiming, setClaiming] = useState(false);
  const [asking, setAsking] = useState<SpeechKind | null>(null);
  const confirm = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const noticeKey = `bridge.micNotice.${room.roomId}.${room.createdAt}`;
  const free = !room.paused && !floor && (open || myTurn);

  const claim = useCallback(
    async (kind: SpeechKind) => {
      setClaiming(true);
      clearTimeout(confirm.current);
      // Mic first: time on the floor should not run out while the browser asks for permission.
      // A refusal (someone was quicker) needs no message: the buttons simply go off.
      await start();
      const granted = await quiet("mic-on", { kind }).then(
        () => true,
        () => false,
      );
      if (!granted) setClaiming(false);
      else confirm.current = setTimeout(() => setClaiming(false), CONFIRM_MS);
    },
    [quiet, start],
  );

  // Stopping is one press. During statements it hands over to the next speaker too.
  const release = useCallback(() => {
    if (!floor) return;
    void quiet(open ? "mic-off" : "end-turn", { phaseVersion: floor.version }).catch(() => {});
  }, [quiet, floor, open]);

  const press = useCallback(
    (kind: SpeechKind) => {
      if (asking || claiming) return;
      if (mine) {
        if (floor?.kind === kind) release();
      } else if (free) {
        if (noticeAlreadyRead(noticeKey)) void claim(kind);
        else setAsking(kind);
      }
    },
    [asking, claim, claiming, floor, free, mine, noticeKey, release],
  );

  useEffect(() => {
    if (mine) setClaiming(false);
  }, [mine]);

  // Whatever took the floor away (time, a pause, the teacher moving on), the microphone goes off too.
  useEffect(() => {
    if (!mine && !claiming && (status === "on" || status === "starting")) stop();
  }, [mine, claiming, status, stop]);

  // Time is up: free the microphone for the next person without waiting for anyone to press anything.
  const held = room.floor?.uid === me.uid ? room.floor.version : null;
  useEffect(() => {
    if (held !== null && !mine && open) void quiet("mic-off", { phaseVersion: held }).catch(() => {});
  }, [held, mine, quiet, open]);

  // Back from a reload still holding the microphone, with nothing listening: let it go so it can be pressed again.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current && room.floor?.uid === me.uid) void quiet("mic-off", { phaseVersion: room.floor.version }).catch(() => {});
    mounted.current = true;
  }, [me.uid, quiet, room.floor]);

  const latest = useRef({ press, kinds, mine, release });
  latest.current = { press, kinds, mine, release };
  useEffect(() => {
    let down: { code: string; at: number } | null = null;
    const onDown = (e: KeyboardEvent) => {
      // e.code, not e.key: with the Korean keyboard on, Z arrives as "ㅋ" or "Process".
      const index = KEYS.indexOf(e.code);
      if (index < 0 || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const kind = latest.current.kinds[index];
      if (!kind) return;
      e.preventDefault();
      down = { code: e.code, at: performance.now() };
      latest.current.press(kind);
    };
    const onUp = (e: KeyboardEvent) => {
      if (down?.code === e.code && performance.now() - down.at >= HOLD_MS && latest.current.mine) latest.current.release();
      down = null;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const problem = {
    blocked: "마이크 사용이 막혀 있어요. 주소창의 권한 설정에서 마이크를 허용해 주세요.",
    unsupported: engine === "browser" ? "이 브라우저는 음성 인식을 지원하지 않아요. Chrome이나 Edge를 써 주세요." : "이 브라우저에서는 마이크를 쓸 수 없어요. HTTPS 주소인지 확인해 주세요.",
    error: "마이크 연결이 끊겼어요. 다시 눌러 주세요.",
  }[status as "blocked" | "unsupported" | "error"];

  const label = (kind: SpeechKind) => {
    if (kind === "statement") return mine ? "말 끝내기" : "말하기";
    return `${KIND_LABEL[kind]}${mine && floor?.kind === kind ? " 끝내기" : "하기"}`;
  };
  const waiting = claiming ? "마이크 켜는 중…" : room.paused ? "일시정지 중에는 마이크를 켤 수 없어요" : "";

  return (
    <div className={`mic-controls${listening ? " live" : ""}`} data-testid="mic-controls" data-live={listening} data-status={status}>
      <div className="mic-buttons">
        {kinds.map((kind, i) => {
          const active = mine && floor?.kind === kind;
          return (
            <button
              key={kind}
              className={`button ${active || i === 0 ? "primary" : "secondary"} mic-button`}
              data-testid={`mic-${kind}`}
              aria-pressed={active}
              disabled={busy || claiming || (mine ? !active : !free)}
              onClick={() => press(kind)}
            >
              <kbd>{KEY_NAMES[i]}</kbd> {label(kind)}
            </button>
          );
        })}
        {myTurn && !mine && !open && (
          <button className="button ghost" data-testid="end-turn" disabled={busy || room.paused} onClick={() => void action("end-turn", { phaseVersion: room.phaseVersion })}>
            차례 넘기기
          </button>
        )}
      </div>
      <p className="mic-state" aria-live="polite">
        {listening ? (
          <>
            <i className="on-air" aria-hidden /> <strong>듣고 있어요</strong> <span data-testid="mic-remaining">{formatSeconds(seconds)} 남음</span>
          </>
        ) : (
          waiting
        )}
        {listening && engine === "server" && status === "on" && (
          <span className="meter" role="img" aria-label="마이크 입력 크기">
            <i style={{ width: `${Math.round(capture.level * 100)}%` }} />
          </span>
        )}
      </p>
      {capture.interim && <p className="mic-interim">{capture.interim}</p>}
      {capture.pending > 0 && <p className="muted small">글로 바꾸는 중 {capture.pending}건</p>}
      {capture.failed > 0 && (
        <p className="mic-problem" data-testid="mic-failed">
          글로 바꾸지 못한 구간이 {capture.failed}건 있어요. 필요하면 선생님이 대신 적어 줄 수 있어요.
        </p>
      )}
      {problem && (
        <p className="mic-problem" role="alert">
          {problem}
          {!allowTyping && " 그대로 말하면 선생님이 대신 적어 줄 수 있어요."}
        </p>
      )}
      {allowTyping && problem && mine && floor && <LineInput speaker="나" onAdd={(text) => void action("line-add", { text, phaseVersion: floor.version })} />}
      {asking && (
        <Sheet title="마이크를 켤까요?" onClose={() => setAsking(null)}>
          <ul className="mic-notice">
            {NOTICE[engine].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <button
            className="button primary full large"
            data-testid="mic-confirm"
            onClick={() => {
              const kind = asking;
              setAsking(null);
              rememberNotice(noticeKey);
              void claim(kind);
            }}
          >
            <Mic size={18} /> 확인했어요. 마이크 켜기
          </button>
        </Sheet>
      )}
    </div>
  );
}
