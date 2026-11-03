// getRandomValues also works on local HTTP/LAN origins where randomUUID is unavailable.
export function createMessageRequestId(source: Pick<Crypto, "randomUUID" | "getRandomValues"> = crypto): string {
  return source.randomUUID?.() ?? Array.from(source.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
}
