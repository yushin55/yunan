import { authenticate } from "./firebase";
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
export async function api<T = Snapshot>(
  path: string,
  body?: unknown,
): Promise<T> {
  try {
    const user = await authenticate();
    const token = await user.getIdToken();
    const res = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok)
      throw new ApiError(
        typeof data.detail === "string"
          ? data.detail
          : "요청을 처리하지 못했습니다. 입력값과 현재 단계를 확인해 주세요.",
        res.status,
      );
    return data;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("fetch") ||
        error.message.includes("network") ||
        error.message.includes("auth/"))
    ) {
      throw new Error(
        "게임 서버에 연결하지 못했습니다. 로컬 서버와 Firebase Emulator를 실행해 주세요. 혼자 연습하기는 바로 이용할 수 있어요.",
      );
    }
    throw error;
  }
}
