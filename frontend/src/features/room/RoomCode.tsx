import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Maximize2, X } from "lucide-react";

export function joinUrl(code: string) {
  return `${location.origin}/join?code=${code}`;
}

export default function RoomCode({ code, large = false }: { code: string; large?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [full, setFull] = useState(false);
  const url = joinUrl(code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard may be blocked; the URL is visible anyway. */
    }
  };
  return (
    <div className={`room-code${large ? " large" : ""}`}>
      <div className="qr" aria-hidden>
        <QRCodeSVG value={url} size={large ? 200 : 132} bgColor="#fffaf0" fgColor="#14201c" marginSize={2} />
      </div>
      <div className="code-text">
        <span className="eyebrow">방 코드</span>
        <strong data-testid="room-code">{code}</strong>
        <span className="url">{url.replace(/^https?:\/\//, "")}</span>
        <div className="row">
          <button className="button ghost small" onClick={copy}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "복사됨" : "링크 복사"}
          </button>
          <button className="button ghost small" onClick={() => setFull(true)}>
            <Maximize2 size={15} /> 크게 보기
          </button>
        </div>
      </div>
      {full && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="방 코드 크게 보기" onClick={() => setFull(false)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <button className="icon-button close" aria-label="닫기" onClick={() => setFull(false)}>
              <X size={22} />
            </button>
            <QRCodeSVG value={url} size={320} bgColor="#fffaf0" fgColor="#14201c" marginSize={2} />
            <strong className="huge-code">{code}</strong>
            <span>{url.replace(/^https?:\/\//, "")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
