import { useEffect, useRef } from "react";
import type { ChatMessage, Participant, Topic } from "../../types/game";
import { KIND_LABELS } from "../game/phases";

export function roleName(topic: Topic, roleId?: string | null) {
  return topic.roles.find((r) => r.id === roleId)?.name ?? "";
}

export default function ChatFeed({
  messages,
  participants,
  topic,
  myUid,
  emptyText = "아직 발언이 없어요. 먼저 말을 꺼내 보세요.",
}: {
  messages: ChatMessage[];
  participants: Participant[];
  topic: Topic;
  myUid?: string;
  emptyText?: string;
}) {
  const feed = useRef<HTMLDivElement>(null);
  // Follow new messages without scrolling the whole page.
  useEffect(() => {
    const el = feed.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  const who = (uid: string | null) => participants.find((p) => p.uid === uid);
  return (
    <div className="chat-feed" ref={feed} aria-live="polite" aria-label="토론 채팅">
      {messages.length === 0 && <p className="muted empty">{emptyText}</p>}
      {messages.map((m) => {
        const author = who(m.uid);
        const target = who(m.targetUid);
        const mine = m.uid === myUid;
        return (
          <div key={m.id} className={`chat-message kind-${m.kind}${mine ? " mine" : ""}`} data-testid="chat-message">
            <div className="meta">
              <strong>{mine ? "나" : (author?.nickname ?? "나간 참가자")}</strong>
              {author?.roleId && <span className="msg-role">{roleName(topic, author.roleId)}</span>}
              {target && <span className="msg-to">→ {target.uid === myUid ? "나" : target.nickname}</span>}
              <span className={`kind-tag kind-${m.kind}`}>{KIND_LABELS[m.kind]}</span>
            </div>
            <p>{m.text}</p>
          </div>
        );
      })}
    </div>
  );
}
