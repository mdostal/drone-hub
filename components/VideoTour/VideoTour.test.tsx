// BDD specs for <VideoTour> against docs/components/video-tour.md's
// Acceptance Criteria (P1-applicable items only — spin/clip P2 items are
// smoke-tested for "doesn't crash" only, per this story's scope):
//
//   - Loads a Tour manifest; renders nodes with spin-clip OR still fallback.
//   - Doorway + minimap navigation with transition-clip OR wipe fallback;
//     no double-fire (busy).
//   - Floor-plan minimap: positions, edges, current-room highlight, clickable.
//
// Fixture: the synthetic tour.fixtures.ts graph (see that file for why it's
// synthetic rather than the real Prado manifest).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Tour } from "@/lib/tour-types";
import { VideoTour } from "./VideoTour";
import { buildSyntheticTour, makeEdge } from "./tour.fixtures";

// VideoTour's navigation timing, re-declared here from VideoTour.tsx (not
// exported by the component) — see its BUSY_COOLDOWN_MS / WIPE_MS:
//   WIPE_MS = 900           the timed "flying to X..." wipe (no edge.clip)
//   BUSY_COOLDOWN_MS = 250  extra cooldown after arrival before busy clears
const WIPE_MS = 900;
const BUSY_COOLDOWN_MS = 250;

function freshTour(): Tour {
  // A fresh object per test so tests that mutate a room/edge in place (the
  // P2 smoke tests below) never leak into other tests.
  return buildSyntheticTour();
}

describe("<VideoTour>", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("initial render", () => {
    it("renders the manifest's startRoom by default", () => {
      render(<VideoTour manifest={freshTour()} />);
      expect(screen.getByText("Front Exterior")).toBeInTheDocument();
    });

    it("honors a startRoom prop override", () => {
      render(<VideoTour manifest={freshTour()} startRoom="kitchen" />);
      expect(screen.getByText("Kitchen")).toBeInTheDocument();
      expect(screen.queryByText("Front Exterior")).not.toBeInTheDocument();
    });

    it("accepts a Tour object directly, with no fetch involved", () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      render(<VideoTour manifest={freshTour()} />);

      expect(screen.getByText("Front Exterior")).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("fetches a manifest URL string and renders once it resolves", async () => {
      const tour = freshTour();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => tour,
        }),
      );

      render(<VideoTour manifest="/tours/synthetic-fixture-house/tour.json" />);
      expect(screen.getByText("Loading tour…")).toBeInTheDocument();

      expect(await screen.findByText("Front Exterior")).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/tours/synthetic-fixture-house/tour.json");
    });

    it("shows an error message when the manifest fetch fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
      );

      render(<VideoTour manifest="/tours/missing/tour.json" />);

      expect(await screen.findByRole("alert")).toHaveTextContent(/404/);
    });
  });

  describe("doorway navigation", () => {
    it("updates the displayed room and its doorway list on navigation", () => {
      vi.useFakeTimers();
      render(<VideoTour manifest={freshTour()} />);

      // front's only doorway is "Living Room".
      fireEvent.click(screen.getByRole("button", { name: "→ Living Room" }));
      act(() => {
        vi.advanceTimersByTime(WIPE_MS + BUSY_COOLDOWN_MS);
      });

      expect(screen.getByText("Living Room")).toBeInTheDocument();
      // living is the 3-way hub: front, kitchen, attic.
      expect(screen.getByRole("button", { name: "→ Front Exterior" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "→ Kitchen" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "→ Attic" })).toBeInTheDocument();
    });

    it("busy-guards: ignores further navigation until the wipe + cooldown finish", () => {
      vi.useFakeTimers();
      render(<VideoTour manifest={freshTour()} />);

      const doorway = screen.getByRole("button", { name: "→ Living Room" });
      fireEvent.click(doorway);

      // Mid-wipe: overlay is up, doorway button is disabled.
      expect(screen.getByText("flying to Living Room…")).toBeInTheDocument();
      expect(doorway).toBeDisabled();

      // A native <button disabled> never dispatches its click handler, so
      // this is a no-op -- still mid-wipe on "front".
      fireEvent.click(doorway);
      expect(screen.getByText("flying to Living Room…")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(WIPE_MS);
      });

      // Arrived at living, but the post-arrival cooldown hasn't elapsed yet
      // -- the new room's doorways must still read as busy.
      expect(screen.getByText("Living Room")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "→ Kitchen" })).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(BUSY_COOLDOWN_MS);
      });

      expect(screen.getByRole("button", { name: "→ Kitchen" })).not.toBeDisabled();
    });
  });

  describe("minimap", () => {
    it("navigates identically to a doorway button when a reachable node is clicked", () => {
      vi.useFakeTimers();
      render(<VideoTour manifest={freshTour()} />);

      const minimap = screen.getByLabelText("Floor plan");
      fireEvent.click(within(minimap).getByRole("button", { name: "Living Room" }));
      act(() => {
        vi.advanceTimersByTime(WIPE_MS + BUSY_COOLDOWN_MS);
      });

      expect(screen.getByText("Living Room")).toBeInTheDocument();
    });

    it("keeps the highlighted node in sync with the current room", () => {
      vi.useFakeTimers();
      render(<VideoTour manifest={freshTour()} />);

      const minimap = screen.getByLabelText("Floor plan");
      expect(
        within(minimap).getByRole("button", { name: "Front Exterior" }),
      ).toHaveAttribute("aria-current", "true");

      fireEvent.click(within(minimap).getByRole("button", { name: "Living Room" }));
      act(() => {
        vi.advanceTimersByTime(WIPE_MS + BUSY_COOLDOWN_MS);
      });

      expect(within(minimap).getByRole("button", { name: "Living Room" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      expect(
        within(minimap).getByRole("button", { name: "Front Exterior" }),
      ).not.toHaveAttribute("aria-current", "true");
    });
  });

  describe("onRoomChange", () => {
    it("fires once on initial render with the start room's id", () => {
      const onRoomChange = vi.fn();
      render(<VideoTour manifest={freshTour()} onRoomChange={onRoomChange} />);

      expect(onRoomChange).toHaveBeenCalledTimes(1);
      expect(onRoomChange).toHaveBeenCalledWith("front");
    });

    it("fires again on every arrival", () => {
      vi.useFakeTimers();
      const onRoomChange = vi.fn();
      render(<VideoTour manifest={freshTour()} onRoomChange={onRoomChange} />);

      fireEvent.click(screen.getByRole("button", { name: "→ Living Room" }));
      act(() => {
        vi.advanceTimersByTime(WIPE_MS + BUSY_COOLDOWN_MS);
      });

      expect(onRoomChange).toHaveBeenCalledTimes(2);
      expect(onRoomChange).toHaveBeenLastCalledWith("living");
    });
  });

  describe("P2 spin/clip (non-crash smoke only — no real P2 media exists yet)", () => {
    it("doesn't crash when the current room sets a spin clip", () => {
      const tour = freshTour();
      tour.rooms.find((r) => r.id === "front")!.spin = "https://example.test/front-spin.mp4";

      expect(() => render(<VideoTour manifest={tour} />)).not.toThrow();
      expect(screen.getByText("Front Exterior")).toBeInTheDocument();
    });

    it("doesn't crash navigating a doorway whose edge has a transition clip", () => {
      const tour = freshTour();
      tour.rooms.find((r) => r.id === "front")!.neighbors = [
        makeEdge("living", { clip: "https://example.test/to-living.mp4" }),
      ];

      render(<VideoTour manifest={tour} />);

      expect(() =>
        fireEvent.click(screen.getByRole("button", { name: "→ Living Room" })),
      ).not.toThrow();
    });
  });
});
