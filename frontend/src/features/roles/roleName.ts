import type { Topic } from "../../types/game";

export function roleName(topic: Topic, roleId?: string | null) {
  return topic.roles.find((r) => r.id === roleId)?.name ?? "";
}
