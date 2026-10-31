import { useEffect, useRef } from "react";
import { CornerDownRight } from "lucide-react";
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
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length]);
  const who = (uid: string | null) => participants.find((p) => p.uid === uid);
  return (
    <div className="chat-feed" aria-live="polite" aria-label="토론 채팅">
      {messages.length === 0 && <p className="muted empty">{emptyText}</p>}
      {messages.map((m) => {
        const author = who(m.uid);
        const target = who(m.targetUid);
        return (
          <div key={m.id} className={`chat-message kind-${m.kind}${m.uid === myUid ? " mine" : ""}`} data-testid="chat-message">
            <div className="meta">
              <strong>{author?.nickname ?? "나간 참가자"}</strong>
              {author?.roleId && <span className="role-tag">{roleName(topic, author.roleId)}</span>}
              <span className={`kind-tag kind-${m.kind}`}>{KIND_LABELS[m.kind]}</span>
            </div>
            {target && (
              <div className="to">
                <CornerDownRight size={13} aria-hidden /> {target.nickname}에게
              </div>
            )}
            <p>{m.text}</p>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
