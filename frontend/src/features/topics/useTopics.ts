import { useEffect, useState } from "react";
import { publicApi } from "../../lib/api";
import type { TopicCatalog } from "../../types/game";

export function useTopics(enabled = true) {
  const [catalog, setCatalog] = useState<TopicCatalog | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    publicApi<TopicCatalog>("/api/topics").then(setCatalog, (e: Error) => setError(e.message));
  }, [enabled]);
  return { catalog, error };
}
