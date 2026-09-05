import type { Snapshot } from "../types";
const base = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");
export const board =
  new URLSearchParams(window.location.search).get("board") || "default";
let memoryKey: string | undefined;
export function ownerKey() {
  if (memoryKey) return memoryKey;
  try {
    const saved = localStorage.getItem("coffee_v3_edit_key");
    if (saved && /^[a-f0-9]{64}$/.test(saved)) return (memoryKey = saved);
  } catch {
    /* A per-session key is still private; UI exposes a recovery action. */
  }
  memoryKey = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  try {
    localStorage.setItem("coffee_v3_edit_key", memoryKey);
  } catch {
    /* no shared anon fallback */
  }
  return memoryKey;
}
export function restoreKey(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value.trim()))
    throw new Error("Enter the 64-character private edit key you saved.");
  localStorage.setItem("coffee_v3_edit_key", value.trim());
  memoryKey = value.trim();
}
export function adminToken() {
  try {
    return sessionStorage.getItem("coffee_v3_admin") || "";
  } catch {
    return "";
  }
}
export function setAdminToken(token: string) {
  if (token) sessionStorage.setItem("coffee_v3_admin", token);
  else sessionStorage.removeItem("coffee_v3_admin");
}
export async function request<T = { ok: boolean }>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(
    `${base}${path}?board=${encodeURIComponent(board)}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Owner-Key": ownerKey(),
        ...(adminToken() ? { Authorization: `Bearer ${adminToken()}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      payload.error || `Request failed (${response.status}). Please retry.`,
    );
  return payload;
}
export const fetchSnapshot = () => request<Snapshot>("/snapshot");
export function subscribeToUpdates(refresh: () => void) {
  const focus = () => {
    if (!document.hidden) refresh();
  };
  window.addEventListener("focus", focus);
  window.addEventListener("online", focus);
  document.addEventListener("visibilitychange", focus);
  const poll = window.setInterval(focus, 30_000); // catches changes from other backend instances
  return () => {
    clearInterval(poll);
    window.removeEventListener("focus", focus);
    window.removeEventListener("online", focus);
    document.removeEventListener("visibilitychange", focus);
  };
}
