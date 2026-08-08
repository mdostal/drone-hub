import { NextRequest, NextResponse } from "next/server";
import { GATE_COOKIE, GATED_PATH_MATCHERS, isGateCookieValid } from "@/lib/gate";

// Gates every prefix in lib/gate.ts's GATED_PATH_PREFIXES (currently /tours/*
// and /properties/*, both the app routes and any raw assets served from
// public/<prefix>/**) behind a passcode. See lib/gate.ts and CLAUDE.md's
// "never deploy un-released assets un-gated" rule.
//
// No cookie / wrong cookie -> 307 redirect to /enter-passcode?next=<path>
// (a pre-made decision from the story spec: redirect+return-path over a bare
// 401/403, for better UX on personal gated links Mathew shares directly).
export function middleware(request: NextRequest) {
  const cookieValue = request.cookies.get(GATE_COOKIE)?.value;
  if (isGateCookieValid(cookieValue)) {
    return NextResponse.next();
  }

  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  // request.nextUrl.clone() (a NextURL instance), not `new URL("/enter-passcode",
  // request.url)` — the latter is a plain WHATWG URL construction: a
  // leading-slash second-arg path discards request.url's own path entirely
  // per spec (same gotcha noted in next.config.ts's E2E_NO_BASE_PATH
  // comment), which silently drops the /framework basePath prefix from the
  // redirect's Location header under the tools.mdostal.com multi-zone mount.
  // NextURL tracks basePath internally and re-adds it on serialization —
  // confirmed empirically via a real basePath build + curl pass (Location
  // came back /framework/enter-passcode?next=%2Fframework%2F... after this
  // fix, vs /enter-passcode?next=%2F... — missing the prefix entirely —
  // before it).
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/enter-passcode";
  redirectUrl.search = "";
  redirectUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(redirectUrl, 307);
}

// Scoped to the prefixes in lib/gate.ts's GATED_PATH_PREFIXES — currently
// /tours/* and /properties/*. (The /enter-passcode route itself is
// intentionally NOT matched here — it must always be reachable or no one
// could ever unlock the gate.)
//
// This is a hand-written LITERAL, not `GATED_PATH_MATCHERS` (lib/gate.ts's
// derived form of the same list), because Next.js statically parses
// `config.matcher` at build time and rejects anything but an inline array
// literal there — `next build` fails with "Next.js can't recognize the
// exported `config` field ... Unknown identifier ... at config.matcher" for
// an imported (or even locally aliased) array. The dev-time assertion below
// is the drift guard in its place: it reads `config.matcher` back out at
// module-eval time (module evaluates per-request in dev/test) and fails
// fast if it and lib/gate.ts's GATED_PATH_PREFIXES fall out of sync, e.g.
// someone adds a third gated prefix to one and forgets the other.
export const config = {
  matcher: ["/tours/:path*", "/properties/:path*"],
};

if (process.env.NODE_ENV !== "production") {
  const expected = GATED_PATH_MATCHERS;
  const actual = config.matcher;
  const inSync = actual.length === expected.length && actual.every((m, i) => m === expected[i]);
  if (!inSync) {
    throw new Error(
      `middleware.ts's config.matcher (${JSON.stringify(actual)}) has drifted ` +
        `from lib/gate.ts's GATED_PATH_PREFIXES (${JSON.stringify(expected)}). ` +
        `Next.js requires config.matcher to be a literal, so update both by hand.`,
    );
  }
}
