// Tests for lib/gate.ts's sanitizeNextPath, written per
// .pHive/epics/layer-viewer/stories/layer-viewer-gating-extension.yaml.
//
// The bug being fixed: sanitizeNextPath used to hardcode
// `next.startsWith("/tours")`, falling back to `/tours` for anything else.
// That meant a passcode-entry redirect from a *different* gated route (e.g.
// /properties/[slug], added by a sibling story) would silently bounce the
// user back to /tours instead of their actual destination.
//
// Coverage below proves:
//   - /tours/* still works unchanged (regression check)
//   - /properties/* now works the same way (the fix)
//   - an unrecognized prefix still falls back safely (open-redirect guard)
//   - the fallback is driven by GATED_PATH_PREFIXES, not a second hardcode
//     bolted on next to the first

import { describe, expect, it } from "vitest";
import { GATED_PATH_MATCHERS, GATED_PATH_PREFIXES, sanitizeNextPath } from "./gate";

describe("sanitizeNextPath", () => {
  describe("/tours/* (regression — pre-existing behavior)", () => {
    it("passes through a /tours path unchanged", () => {
      expect(sanitizeNextPath("/tours/2806-prado")).toBe("/tours/2806-prado");
    });

    it("passes through a /tours path with a query string unchanged", () => {
      expect(sanitizeNextPath("/tours/2806-prado?room=kitchen")).toBe(
        "/tours/2806-prado?room=kitchen",
      );
    });
  });

  describe("/properties/* (new — the fix)", () => {
    it("passes through a /properties path unchanged instead of bouncing to /tours", () => {
      expect(sanitizeNextPath("/properties/2806-prado")).toBe("/properties/2806-prado");
    });

    it("passes through a /properties path with a query string unchanged", () => {
      expect(sanitizeNextPath("/properties/2806-prado?tab=ortho")).toBe(
        "/properties/2806-prado?tab=ortho",
      );
    });
  });

  describe("open-redirect guard", () => {
    it("falls back safely for an unrecognized prefix rather than passing it through", () => {
      expect(sanitizeNextPath("/some-other-route")).toBe(GATED_PATH_PREFIXES[0]);
    });

    it("falls back safely for an absolute/off-site URL (classic open-redirect vector)", () => {
      expect(sanitizeNextPath("https://evil.example/phish")).toBe(GATED_PATH_PREFIXES[0]);
    });

    it("falls back safely for a protocol-relative URL", () => {
      expect(sanitizeNextPath("//evil.example/phish")).toBe(GATED_PATH_PREFIXES[0]);
    });

    it("falls back safely for null", () => {
      expect(sanitizeNextPath(null)).toBe(GATED_PATH_PREFIXES[0]);
    });

    it("falls back safely for undefined", () => {
      expect(sanitizeNextPath(undefined)).toBe(GATED_PATH_PREFIXES[0]);
    });

    it("falls back safely for an empty string", () => {
      expect(sanitizeNextPath("")).toBe(GATED_PATH_PREFIXES[0]);
    });

    it("does not match a prefix as a substring elsewhere in the path", () => {
      // Must not treat "/not-tours" as matching "/tours" via a naive substring check.
      expect(sanitizeNextPath("/not-tours/evil")).toBe(GATED_PATH_PREFIXES[0]);
    });
  });

  describe("generalization (not a second hardcoded special-case)", () => {
    it("accepts every prefix currently listed in GATED_PATH_PREFIXES", () => {
      for (const prefix of GATED_PATH_PREFIXES) {
        const path = `${prefix}/some-slug`;
        expect(sanitizeNextPath(path)).toBe(path);
      }
    });

    it("keeps middleware.ts's matcher derived from the same shared list (no drift)", () => {
      expect(GATED_PATH_MATCHERS).toEqual(GATED_PATH_PREFIXES.map((p) => `${p}/:path*`));
    });
  });
});
