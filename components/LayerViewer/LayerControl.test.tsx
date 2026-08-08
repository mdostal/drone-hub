// BDD specs for <LayerControl> in isolation — same RTL render/interaction
// pattern as components/VideoTour/DoorwayControls.test.tsx (a plain,
// controlled, presentational DOM component with no WebGL/MapLibre
// involved, so full rendering is safe and meaningful here, unlike
// <LayerViewer> itself — see LayerViewer.test.tsx's header comment).
// Covers docs/components/layer-viewer.md's "one row per LayerDef, toggle +
// opacity slider, disabled stub renders visibly but inert" behavior.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LayerDef } from "@/lib/layer-types";
import { LayerControl } from "./LayerControl";

function makeLayer(overrides: Partial<LayerDef> & Pick<LayerDef, "id" | "type">): LayerDef {
  return {
    url: "https://example.test/data",
    opacity: 0.8,
    toggle: true,
    ...overrides,
  };
}

describe("<LayerControl>", () => {
  const layers: LayerDef[] = [
    makeLayer({ id: "ortho", type: "raster", opacity: 0.9, toggle: true, legend: "visual" }),
    makeLayer({ id: "hillshade", type: "raster", opacity: 0.4, toggle: false }),
    // The CBA's literal thermal-stub shape (lib/layer-types.ts's example).
    makeLayer({
      id: "thermal",
      type: "raster",
      url: null,
      opacity: 1,
      toggle: false,
      disabled: true,
      legend: "ironbow",
    }),
  ];

  it("renders nothing for an empty layer list", () => {
    const { container } = render(
      <LayerControl layers={[]} onToggle={vi.fn()} onOpacityChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a toggle + opacity row for every layer, in manifest order, inside a labeled group", () => {
    render(<LayerControl layers={layers} onToggle={vi.fn()} onOpacityChange={vi.fn()} />);

    const group = screen.getByRole("group", { name: "Layers" });
    expect(group).toBeInTheDocument();

    for (const layer of layers) {
      expect(screen.getByRole("checkbox", { name: `Toggle ${layer.id} layer` })).toBeInTheDocument();
      expect(screen.getByRole("slider", { name: `${layer.id} opacity` })).toBeInTheDocument();
    }
  });

  it("reflects each row's current toggle and opacity values", () => {
    render(<LayerControl layers={layers} onToggle={vi.fn()} onOpacityChange={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Toggle ortho layer" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Toggle hillshade layer" })).not.toBeChecked();
    expect(screen.getByRole("slider", { name: "ortho opacity" })).toHaveValue("0.9");
    expect(screen.getByRole("slider", { name: "hillshade opacity" })).toHaveValue("0.4");
  });

  it("renders legend text only for entries that have one", () => {
    render(<LayerControl layers={layers} onToggle={vi.fn()} onOpacityChange={vi.fn()} />);

    expect(screen.getByText("visual")).toBeInTheDocument();
    expect(screen.getByText("ironbow")).toBeInTheDocument();
    // hillshade has no `legend` — only the two labeled swatches above exist.
    expect(screen.getAllByText(/visual|ironbow/)).toHaveLength(2);
  });

  it("marks the disabled entry's row non-interactive: aria-disabled row, disabled controls", () => {
    render(<LayerControl layers={layers} onToggle={vi.fn()} onOpacityChange={vi.fn()} />);

    const thermalToggle = screen.getByRole("checkbox", { name: "Toggle thermal layer" });
    const thermalSlider = screen.getByRole("slider", { name: "thermal opacity" });

    expect(thermalToggle).toBeDisabled();
    expect(thermalSlider).toBeDisabled();
    expect(thermalToggle.closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "true");

    // Live rows are NOT marked aria-disabled.
    const orthoToggle = screen.getByRole("checkbox", { name: "Toggle ortho layer" });
    expect(orthoToggle.closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "false");
  });

  it("keeps the disabled entry's controls out of the interaction path — cannot receive focus", () => {
    // NOTE on why this isn't `fireEvent.click(...); expect(onToggle).not.toHaveBeenCalled()`
    // (which is what DoorwayControls.test.tsx does for its disabled
    // <button>): verified empirically that jsdom does NOT implement the
    // HTML disabled-suppression for a *synthetically dispatched*
    // click/change on <input> elements — `fireEvent.click`/`fireEvent.change`
    // on a disabled checkbox/range still flips its value and fires the
    // change listener in this jsdom version, unlike a real browser (and
    // unlike <button>, where React's own event-listener registration
    // already strips `onClick` for disabled button/input/select/textarea —
    // see react-dom's `getListener`, which does NOT cover `onChange`).
    // Faithfully asserting "a click/drag has no effect" needs
    // @testing-library/user-event (simulates real focus-then-input
    // sequences), which isn't installed and is out of scope here per this
    // story's "don't add new test infra" rule. What IS faithfully
    // testable in jsdom, and is the actual real-browser mechanism that
    // makes a disabled control uninteractive in the first place: it can
    // never receive focus, so no real mouse/keyboard/drag interaction can
    // ever reach it to fire a change event. jsdom correctly implements
    // that part of the disabled contract.
    render(<LayerControl layers={layers} onToggle={vi.fn()} onOpacityChange={vi.fn()} />);

    const thermalToggle = screen.getByRole("checkbox", { name: "Toggle thermal layer" });
    const thermalSlider = screen.getByRole("slider", { name: "thermal opacity" });

    thermalToggle.focus();
    expect(document.activeElement).not.toBe(thermalToggle);
    thermalSlider.focus();
    expect(document.activeElement).not.toBe(thermalSlider);
  });

  it("fires onToggle with the layer id and new checked value on a toggle click", () => {
    const onToggle = vi.fn();
    render(<LayerControl layers={layers} onToggle={onToggle} onOpacityChange={vi.fn()} />);

    // hillshade starts unchecked (toggle: false) — clicking checks it.
    fireEvent.click(screen.getByRole("checkbox", { name: "Toggle hillshade layer" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("hillshade", true);
  });

  it("fires onOpacityChange with the layer id and new numeric value on a slider change", () => {
    const onOpacityChange = vi.fn();
    render(<LayerControl layers={layers} onToggle={vi.fn()} onOpacityChange={onOpacityChange} />);

    fireEvent.change(screen.getByRole("slider", { name: "ortho opacity" }), {
      target: { value: "0.42" },
    });

    expect(onOpacityChange).toHaveBeenCalledTimes(1);
    expect(onOpacityChange).toHaveBeenCalledWith("ortho", 0.42);
  });
});
