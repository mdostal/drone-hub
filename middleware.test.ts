// Tests for middleware.ts, written per
// .pHive/epics/layer-viewer/stories/layer-viewer-gating-extension.yaml.
//
// These exercise the actual middleware() function end-to-end (not just
// sanitizeNextPath in isolation — see lib/gate.test.ts for that), proving
// the acceptance criteria that matter at this layer:
//   - Given no cookie, /properties/<slug> 307-redirects to
//     /enter-passcode?next=/properties/<slug> (not /tours) — the bug fix.
//   - /tours/<slug> keeps doing the same thing it always did (regression).
//   - A valid gate cookie lets both prefixes through untouched.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GATE_COOKIE } from "@/lib/gate";
import { middleware } from "./middleware";

const PASSCODE = "test-passcode-123";
const originalPasscode = process.env.DRONE_HUB_PASSCODE;

beforeEach(() => {
  process.env.DRONE_HUB_PASSCODE = PASSCODE;
});

afterAll(() => {
  process.env.DRONE_HUB_PASSCODE = originalPasscode;
});

function requestFor(path: string, cookieValue?: string): NextRequest {
  const req = new NextRequest(new URL(path, "https://example.test"));
  if (cookieValue !== undefined) {
    req.cookies.set(GATE_COOKIE, cookieValue);
  }
  return req;
}

describe("middleware", () => {
  describe("/tours/* (regression — pre-existing behavior, unchanged)", () => {
    it("307-redirects to /enter-passcode?next=<path> when there is no gate cookie", () => {
      const res = middleware(requestFor("/tours/2806-prado"));
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.pathname).toBe("/enter-passcode");
      expect(location.searchParams.get("next")).toBe("/tours/2806-prado");
    });

    it("lets the request through when the gate cookie holds the correct passcode", () => {
      const res = middleware(requestFor("/tours/2806-prado", PASSCODE));
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("/properties/* (new — the fix)", () => {
    it("307-redirects to /enter-passcode?next=/properties/<slug>, not /tours (the bug this story fixes)", () => {
      const res = middleware(requestFor("/properties/2806-prado"));
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.pathname).toBe("/enter-passcode");
      expect(location.searchParams.get("next")).toBe("/properties/2806-prado");
    });

    it("lets the request through when the gate cookie holds the correct passcode", () => {
      const res = middleware(requestFor("/properties/2806-prado", PASSCODE));
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("wrong cookie value", () => {
    it("still redirects /properties/* to /enter-passcode with the right next= when the cookie is wrong", () => {
      const res = middleware(requestFor("/properties/2806-prado", "wrong-passcode"));
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.searchParams.get("next")).toBe("/properties/2806-prado");
    });
  });
});
