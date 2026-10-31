// Only the room id and view are stored so the home page can offer "돌아가기".
// Roles and secrets come back from the server after reconnecting, never from storage.
const KEY = "bridge.lastRoom";

export function rememberRoom(roomId: string, viewer: "host" | "student") {
  try {
    localStorage.setItem(KEY, JSON.stringify({ roomId, viewer, at: Date.now() }));
  } catch {
    /* Storage can be unavailable in private windows. */
  }
}

export function lastRoom(): { roomId: string; viewer: "host" | "student" } | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    // Classes end; don't offer a room older than half a day.
    return value && Date.now() - value.at < 12 * 3600 * 1000 ? value : null;
  } catch {
    return null;
  }
}

export function rememberNickname(nickname: string) {
  try {
    localStorage.setItem("bridge.nickname", nickname);
  } catch {
    /* ignore */
  }
}

export function savedNickname() {
  try {
    return localStorage.getItem("bridge.nickname") || "";
  } catch {
    return "";
  }
}
