// Passcode gate for /tours/* — CLAUDE.md hard rule: "never deploy un-released
// assets un-gated." Property footage is private until Mathew signs off.
//
// Shared by middleware.ts (edge runtime) and app/enter-passcode/actions.ts
// (node runtime) — keep this file free of node-only APIs so it works in both.
//
// The passcode itself lives in env var DRONE_HUB_PASSCODE (see .env.example).
// It is never hardcoded here. If the env var is unset, the gate fails CLOSED
// (nothing can match an empty passcode), so a misconfigured deploy stays
// gated rather than accidentally public.

export const GATE_COOKIE = "dronehub_tour_gate";
export const GATE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function configuredPasscode(): string {
  return process.env.DRONE_HUB_PASSCODE ?? "";
}

/** Does this candidate passcode (from the entry form) match the configured one? */
export function isCorrectPasscode(candidate: string): boolean {
  const passcode = configuredPasscode();
  return passcode.length > 0 && candidate.trim() === passcode;
}

/** Does this cookie value (from an incoming request) grant access? */
export function isGateCookieValid(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  return isCorrectPasscode(cookieValue);
}

/** Only ever redirect back into the gated area — blocks open-redirect via ?next=. */
export function sanitizeNextPath(next: string | undefined | null): string {
  if (next && next.startsWith("/tours")) return next;
  return "/tours";
}
