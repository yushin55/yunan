import { authenticate, useEmulators } from "./firebase";
import type { Snapshot } from "../types/game";

const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function detail(data: unknown): string {
  const value = (data as { detail?: unknown })?.detail;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0]?.msg === "string")
    return value[0].msg.replace(/^Value error, /, "");
  return "요청을 처리하지 못했어요. 입력과 현재 단계를 확인해 주세요.";
}

export async function api<T = Snapshot>(path: string, body?: unknown): Promise<T> {
  let token: string;
  try {
    token = await (await authenticate()).getIdToken();
  } catch {
    throw new ApiError(
      useEmulators
        ? "로그인 서버(Firebase 에뮬레이터)에 연결하지 못했어요. 저장소 루트에서 `npm run emulators`가 실행 중인지 확인해 주세요."
        : "익명 로그인에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
      0,
    );
  }
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(`게임 서버(${base})에 연결하지 못했어요. 서버가 실행 중인지, 인터넷 연결을 확인해 주세요.`, 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(detail(data), res.status);
  return data as T;
}

export async function publicApi<T>(path: string): Promise<T> {
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error();
    return (await res.json()) as T;
  } catch {
    throw new ApiError("게임 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 0);
  }
}
