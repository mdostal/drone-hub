// BDD specs for <Gallery> in isolation. Covers gallery-component-and-docs'
// acceptance criteria: all images render as slides, prev/next nav via click
// and arrow keys, loop=true wraps at the boundary (default), loop=false
// disables prev/next at the boundaries instead of wrapping, and dot
// indicators show/allow navigation to the current slide.
//
// embla-carousel-react's real engine computes scroll snaps from live
// browser layout (offsetWidth/offsetLeft) that jsdom cannot faithfully
// reproduce -- its own scroll-position math is embla's concern, not
// <Gallery>'s. This spec mocks "embla-carousel-react" with a small,
// deterministic fake engine that honors the same public contract
// (selectedScrollSnap/canScrollPrev/canScrollNext/scrollPrev/scrollNext/
// scrollTo/on/off) so these tests verify <Gallery>'s OWN wiring -- does it
// call the right embla methods on click/keydown, does it render dots/
// disabled-state off the right embla state -- deterministically, the same
// approach used to test other thin wrappers around browser-layout-dependent
// libraries in this repo (e.g. MapLibre/three.js viewers are exercised live
// via Playwright, not asked to compute real layout under jsdom).
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Gallery } from "./Gallery";
import type { GalleryImage } from "./Gallery";

vi.mock("embla-carousel-react", () => {
  // Module-scoped (not React-state-backed) fake engine -- <Gallery> re-runs
  // the hook on every render, so state has to live outside React to survive
  // that, exactly like the real embla-carousel-react instance living inside
  // its own internal engine object. `ref` is stable across renders of the
  // SAME mounted tree but is re-invoked by React on every actual mount
  // (each test's `render()` call) and unmount (RTL's afterEach `cleanup()`,
  // see vitest.setup.ts) -- the unmount call (`node === null`) is used
  // below as the reset hook so each test starts from a clean slide index.
  let index = 0;
  let slideCount = 0;
  let loop = true;
  const listeners = new Set<() => void>();

  const ref = (node: HTMLElement | null) => {
    if (node) {
      const slidesContainer = node.children[0];
      slideCount = slidesContainer ? slidesContainer.children.length : 0;
    } else {
      index = 0;
      slideCount = 0;
      listeners.clear();
    }
  };

  const emitSelect = () => listeners.forEach((fn) => fn());

  const api = {
    selectedScrollSnap: () => index,
    canScrollPrev: () => (loop ? slideCount > 1 : index > 0),
    canScrollNext: () => (loop ? slideCount > 1 : index < slideCount - 1),
    scrollPrev: () => {
      if (slideCount === 0) return;
      if (index > 0) index -= 1;
      else if (loop) index = slideCount - 1;
      else return;
      emitSelect();
    },
    scrollNext: () => {
      if (slideCount === 0) return;
      if (index < slideCount - 1) index += 1;
      else if (loop) index = 0;
      else return;
      emitSelect();
    },
    scrollTo: (target: number) => {
      if (target === index) return;
      index = target;
      emitSelect();
    },
    on: (name: string, fn: () => void) => {
      if (name === "select") listeners.add(fn);
    },
    off: (name: string, fn: () => void) => {
      if (name === "select") listeners.delete(fn);
    },
  };

  return {
    default: (options: { loop?: boolean } = {}) => {
      loop = options.loop ?? true;
      return [ref, api] as const;
    },
  };
});

const IMAGES: GalleryImage[] = [
  { src: "/gallery-samples/one.jpg", alt: "First shot" },
  { src: "/gallery-samples/two.jpg", alt: "Second shot", caption: "Second caption" },
  { src: "/gallery-samples/three.jpg", alt: "Third shot" },
];

function activeDotLabel() {
  return screen
    .getAllByRole("button", { name: /^Go to slide/ })
    .find((dot) => dot.getAttribute("aria-current") === "true")
    ?.getAttribute("aria-label");
}

describe("<Gallery>", () => {
  it("Given 3+ images, when mounted, then every image renders as a carousel slide", () => {
    render(<Gallery images={IMAGES} />);

    expect(screen.getByAltText("First shot")).toBeInTheDocument();
    expect(screen.getByAltText("Second shot")).toBeInTheDocument();
    expect(screen.getByAltText("Third shot")).toBeInTheDocument();
    expect(screen.getAllByRole("group")).toHaveLength(3);
    expect(screen.getByText("Second caption")).toBeInTheDocument();
  });

  it("Given the prev/next buttons, when clicked, then the carousel navigates forward and back", () => {
    render(<Gallery images={IMAGES} />);

    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(activeDotLabel()).toBe("Go to slide 2");

    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(activeDotLabel()).toBe("Go to slide 1");
  });

  it("Given focus on the carousel, when left/right arrow keys are pressed, then it navigates forward and back", () => {
    render(<Gallery images={IMAGES} />);
    const region = screen.getByRole("region", { name: "Image gallery" });

    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(activeDotLabel()).toBe("Go to slide 2");

    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(activeDotLabel()).toBe("Go to slide 1");
  });

  it("Given loop is omitted (default true), when next is clicked past the last slide, then it wraps to the first slide", () => {
    render(<Gallery images={IMAGES} />);
    const next = screen.getByRole("button", { name: "Next image" });

    fireEvent.click(next);
    expect(activeDotLabel()).toBe("Go to slide 2");
    fireEvent.click(next);
    expect(activeDotLabel()).toBe("Go to slide 3");

    // Next button must never be disabled while looping.
    expect(next).not.toBeDisabled();

    fireEvent.click(next);
    expect(activeDotLabel()).toBe("Go to slide 1");
  });

  it("Given loop={false}, when the carousel reaches the last slide, then the next button disables instead of wrapping", () => {
    render(<Gallery images={IMAGES} loop={false} />);
    const next = screen.getByRole("button", { name: "Next image" });
    const prev = screen.getByRole("button", { name: "Previous image" });

    expect(prev).toBeDisabled();

    fireEvent.click(next);
    expect(activeDotLabel()).toBe("Go to slide 2");
    fireEvent.click(next);
    expect(activeDotLabel()).toBe("Go to slide 3");

    expect(next).toBeDisabled();

    // Clicking a disabled next button must not wrap back to slide 1.
    fireEvent.click(next);
    expect(activeDotLabel()).toBe("Go to slide 3");
  });

  it("Given loop={false} at the first slide, then the prev button is disabled and won't navigate", () => {
    render(<Gallery images={IMAGES} loop={false} />);
    const prev = screen.getByRole("button", { name: "Previous image" });

    expect(prev).toBeDisabled();
    fireEvent.click(prev);
    expect(activeDotLabel()).toBe("Go to slide 1");
  });

  it("Given dot indicators, then they reflect the active slide and clicking one navigates directly to it", () => {
    render(<Gallery images={IMAGES} />);

    const dots = screen.getAllByRole("button", { name: /^Go to slide/ });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute("aria-current", "true");
    expect(dots[1]).toHaveAttribute("aria-current", "false");
    expect(dots[2]).toHaveAttribute("aria-current", "false");

    fireEvent.click(dots[2]);

    expect(dots[2]).toHaveAttribute("aria-current", "true");
    expect(dots[0]).toHaveAttribute("aria-current", "false");
  });

  it("Given an empty images array, when rendered, then it shows a 'No images.' message rather than an empty carousel", () => {
    render(<Gallery images={[]} />);
    expect(screen.getByText("No images.")).toBeInTheDocument();
  });
});
