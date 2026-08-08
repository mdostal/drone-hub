"use client";

import type { LayerDef } from "@/lib/layer-types";
import { cx } from "./cx";

/**
 * <LayerControl> — the visible "killer feature" UI (CLAUDE.md): one row per
 * `LayerDef` with a toggle + opacity slider. Fully controlled/presentational
 * — it owns no state of its own. A consumer feeds it the live `layers`
 * array (e.g. from <LayerViewer>'s `onLayersChange`) and wires `onToggle` /
 * `onOpacityChange` back to something that can mutate that array (e.g.
 * <LayerViewer>'s imperative handle). See LayerViewer.tsx's header comment
 * for the full state-ownership rationale and index.ts for a wiring example.
 *
 * `disabled: true` rows (the thermal stub) render visibly but inert — the
 * CBA "killer feature preview": the toggle exists before the data does.
 */
export interface LayerControlProps {
  /** one row per entry, in manifest order — including disabled stubs. */
  layers: LayerDef[];
  /** fired when a non-disabled row's toggle changes. */
  onToggle: (id: string, toggle: boolean) => void;
  /** fired when a non-disabled row's opacity slider changes (0-1). */
  onOpacityChange: (id: string, opacity: number) => void;
  className?: string;
}

export function LayerControl({ layers, onToggle, onOpacityChange, className }: LayerControlProps) {
  if (layers.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Layers"
      className={cx(
        "flex flex-col gap-3 rounded-xl border border-border bg-surface/90 p-3 text-sm text-foreground backdrop-blur",
        className,
      )}
    >
      {layers.map((layer) => {
        const disabled = layer.disabled ?? false;
        return (
          <div
            key={layer.id}
            // aria-disabled (not just greyed CSS) so the "present but
            // inert" thermal-stub requirement is real for assistive tech
            // too, not only a visual cue.
            aria-disabled={disabled}
            className={cx("flex items-center gap-3", disabled && "opacity-40")}
          >
            <label className="flex flex-1 items-center gap-2">
              <input
                type="checkbox"
                checked={layer.toggle}
                disabled={disabled}
                onChange={(e) => onToggle(layer.id, e.target.checked)}
                aria-label={`Toggle ${layer.id} layer`}
              />
              <span className="min-w-0 flex-1 truncate capitalize">{layer.id}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={layer.opacity}
              disabled={disabled}
              onChange={(e) => onOpacityChange(layer.id, Number(e.target.value))}
              aria-label={`${layer.id} opacity`}
              className="w-24"
            />
            {layer.legend && <span className="w-28 shrink-0 text-xs text-muted">{layer.legend}</span>}
          </div>
        );
      })}
    </div>
  );
}
