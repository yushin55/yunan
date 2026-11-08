import { HAIR, SEAT_COLORS, SKIN } from "../../components/scene/palette";
import type { Participant } from "../../types/game";

/**
 * The look of someone's character at the 3D table: coat by seat, skin, hair and hat by their
 * place among the people the viewer sees (the table leaves the viewer out).
 */
export function lookOf(participants: Participant[], uid: string, viewerUid?: string) {
  const person = participants.find((p) => p.uid === uid);
  const place = participants.filter((p) => p.uid !== viewerUid).findIndex((p) => p.uid === uid);
  const index = place >= 0 ? place : (person?.seat ?? 0);
  return { coat: SEAT_COLORS[(person?.seat ?? 0) % SEAT_COLORS.length], skin: SKIN[index % SKIN.length], hair: HAIR[index % HAIR.length], variant: index % 5 };
}

/**
 * A flat drawing of a table character, cheering (arms up, hopping) or slumping (hands on the
 * head, head hanging and shaking).
 */
export default function BlockAvatar({ coat, skin, hair, variant, mood }: ReturnType<typeof lookOf> & { mood: "cheer" | "slump" }) {
  const shirt = variant % 2 ? "#d8d6c2" : "#eee1c9";
  const eye = "#1d2428";
  return (
    <svg className={`block-avatar mood-${mood}`} viewBox="0 -30 220 290" aria-hidden>
      <g className="ba-body">
        <g className="ba-arm left">
          <rect x="22" y="132" width="34" height="86" rx="10" fill={coat} />
          <rect x="24" y="206" width="30" height="26" rx="8" fill={skin} />
        </g>
        <g className="ba-arm right">
          <rect x="164" y="132" width="34" height="86" rx="10" fill={coat} />
          <rect x="166" y="206" width="30" height="26" rx="8" fill={skin} />
        </g>
        <rect x="50" y="128" width="120" height="104" rx="16" fill={coat} />
        <rect x="96" y="128" width="28" height="84" fill={shirt} />
        <path d="M96 128 L82 128 L100 176 Z M124 128 L138 128 L120 176 Z" fill={coat} opacity="0.85" />
        <rect x="96" y="112" width="28" height="20" fill={skin} />
        <g className="ba-head">
          <rect x="48" y="58" width="14" height="24" rx="5" fill={skin} />
          <rect x="158" y="58" width="14" height="24" rx="5" fill={skin} />
          <rect x="58" y="24" width="104" height="96" rx="14" fill={skin} />
          <rect x="54" y="14" width="112" height="30" rx="12" fill={hair} />
          {variant === 3 && (
            <>
              <rect x="50" y="30" width="16" height="62" rx="6" fill={hair} />
              <rect x="154" y="30" width="16" height="62" rx="6" fill={hair} />
            </>
          )}
          <rect x="78" y={mood === "slump" ? 54 : 48} width="20" height="4" rx="2" fill={hair} transform={mood === "slump" ? "rotate(-12 88 56)" : undefined} />
          <rect x="122" y={mood === "slump" ? 54 : 48} width="20" height="4" rx="2" fill={hair} transform={mood === "slump" ? "rotate(12 132 56)" : undefined} />
          <rect x="82" y="60" width="11" height="15" rx="3" fill={eye} />
          <rect x="127" y="60" width="11" height="15" rx="3" fill={eye} />
          <rect x="104" y="78" width="12" height="10" rx="3" fill="#000" opacity="0.08" />
          {mood === "cheer" ? <path d="M92 94 q18 18 36 0 z" fill="#865a50" /> : <path d="M94 104 q16 -12 32 0" stroke="#865a50" strokeWidth="4" fill="none" strokeLinecap="round" />}
          {variant === 0 && (
            <>
              <rect x="50" y="2" width="120" height="36" rx="14" fill="#8c4d45" />
              <rect x="50" y="28" width="120" height="13" rx="5" fill="#a96557" />
            </>
          )}
          {variant === 1 && [66, 88, 110, 132, 154].map((cx, i) => <circle key={cx} cx={cx} cy={i % 2 ? 14 : 18} r="15" fill={hair} />)}
          {variant === 2 && (
            <g fill="none" stroke="#4d4c44" strokeWidth="4">
              <circle cx="87" cy="67" r="15" />
              <circle cx="132" cy="67" r="15" />
              <path d="M102 67 h15" />
            </g>
          )}
          {variant === 4 && (
            <>
              <rect x="50" y="4" width="120" height="34" rx="13" fill="#77715f" />
              <rect x="86" y="30" width="80" height="11" rx="4" fill="#77715f" />
            </>
          )}
        </g>
      </g>
    </svg>
  );
}
