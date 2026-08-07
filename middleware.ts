import { NextRequest, NextResponse } from "next/server";
import { GATE_COOKIE, isGateCookieValid } from "@/lib/gate";

// Gates /tours/* (both the app route and raw assets served from
// public/tours/**) behind a passcode. See lib/gate.ts and CLAUDE.md's
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
  const redirectUrl = new URL("/enter-passcode", request.url);
  redirectUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(redirectUrl, 307);
}

// Scoped to /tours/* only, per the story's do_not: no broader gating in this
// epic. (The /enter-passcode route itself is intentionally NOT matched here
// — it must always be reachable or no one could ever unlock the gate.)
export const config = {
  matcher: ["/tours/:path*"],
};
