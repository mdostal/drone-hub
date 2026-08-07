// Passcode gate for every prefix in GATED_PATH_PREFIXES below (currently
// /tours/* and /properties/*) — CLAUDE.md hard rule: "never deploy
// un-released assets un-gated." Property footage is private until Mathew
// signs off.
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

// Single source of truth for every path prefix the passcode gate covers.
// middleware.ts derives its matcher from this same array (see GATED_PATH_MATCHERS
// below), so adding a future gated route (e.g. a third property-intelligence
// surface) is a one-line change here rather than a hardcode bolted on in two
// places. sanitizeNextPath below also reads this list, which is the actual bug
// fix: it used to hardcode "/tours" only, so a redirect from a newly-gated
// route (e.g. /properties/[slug]) would silently bounce back to /tours instead
// of the user's real destination.
//
// NOTE: still one global passcode/cookie for every prefix in this list — see
// the layer-viewer-gating-extension story's accepted scope limitation. This
// array controls which paths REQUIRE the gate, not per-prefix credentials.
export const GATED_PATH_PREFIXES = ["/tours", "/properties"] as const;

// middleware.ts's `config.matcher` must be a static array literal (Next.js
// reads it at build time, not at runtime), so we can't compute it by calling
// a function there — but we CAN derive it from the same shared array via a
// plain `.map()` at module-eval time, which keeps the two files from ever
// drifting out of sync.
export const GATED_PATH_MATCHERS = GATED_PATH_PREFIXES.map((prefix) => `${prefix}/:path*`);

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

/**
 * Only ever redirect back into a currently-gated area — blocks open-redirect
 * via ?next=. Accepts any prefix in GATED_PATH_PREFIXES (not just /tours), so
 * a passcode-entry redirect from any gated route lands the user back where
 * they actually asked to go. An unrecognized prefix (or a malformed/absolute
 * URL trying to escape the app) falls back to the first gated prefix.
 */
export function sanitizeNextPath(next: string | undefined | null): string {
  if (next && GATED_PATH_PREFIXES.some((prefix) => next.startsWith(prefix))) {
    return next;
  }
  return GATED_PATH_PREFIXES[0];
}
