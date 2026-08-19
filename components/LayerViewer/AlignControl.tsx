"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
// Pure CSS — safe to import statically, same rationale as LayerViewer.tsx's
// own identical import.
import "maplibre-gl/dist/maplibre-gl.css";
import type { LayerDef } from "@/lib/layer-types";
import type { LayerViewerHandle } from "./LayerViewer";
import { buildLayerMapConfig, loadMapLibreModules, updateLayerOnMap } from "./LayerViewer";
import { cx } from "./cx";

/**
 * <AlignControl> — layerviewer-phase2-tools epic's AlignControl story. The
 * REAL problem this solves (CLAUDE.md's Phase-0 section, not cosmetic
 * polish): the operator's drone has no RTK GPS, so every georeferenced
 * raster layer (ortho/hillshade/thermal) can be visibly misaligned from the
 * real-world satellite base by 1-3m, with zero way today to correct it.
 * This panel lets a consumer manually nudge ONE registered layer's rendered
 * position by small lat/lng deltas and read back the cumulative offset in
 * meters.
 *
 * THE REAL QUESTION THIS STORY ASKS ("don't assume a generic translate
 * paint property exists — confirm the actual mechanism"): researched
 * directly against this repo's OWN installed `maplibre-gl` before writing
 * anything below.
 *
 * - `buildLayerMapConfig` (LayerViewer.tsx) shows every raster layer in
 *   this registry — ortho/hillshade/thermal, `format: 'cog'` in every real
 *   sample manifest (public/layer-viewer-samples/2806-prado/layers.json) —
 *   is added as a plain `{ type: "raster", url: "cog://..." }` (or, for
 *   `format: 'xyz'`, `{ type: "raster", tiles: [...] }`) MapLibre source,
 *   rendered through a `raster` layer.
 * - Checked node_modules/@maplibre/maplibre-gl-style-spec/src/reference/
 *   v8.json directly (the live spec shipped with this repo's installed
 *   maplibre-gl, not assumed/remembered): `paint_raster` has exactly
 *   `raster-opacity, raster-hue-rotate, raster-brightness-min/max,
 *   raster-saturation, raster-contrast, raster-resampling,
 *   raster-fade-duration` — **no `raster-translate`.** `paint_fill` and
 *   `paint_line` DO have `fill-translate`/`line-translate` — but those only
 *   exist for vector (geojson) layer types, and this registry's actual
 *   alignment-drift problem (CLAUDE.md) is specifically about RASTER
 *   imagery, so a vector-only paint property wouldn't even solve the real
 *   case.
 * - `@geomatico/maplibre-cog-protocol` (the `cog://` scheme this repo
 *   registers once in LayerViewer.tsx's `loadMapLibreModules`) exposes no
 *   offset/bbox-override hook either — its only exported surface is
 *   `cogProtocol`, `colorScale`, `setColorFunction`, `locationValues` (its
 *   own dist/index.d.ts). It re-derives each tile's geographic bbox purely
 *   from the (z,x,y) MapLibre requests — no per-source transform is exposed
 *   for us to hook.
 * - A plain `format: 'xyz'` raster source is even less movable: those tiles
 *   come from an external server (e.g. Esri) on a fixed, standard slippy-map
 *   grid — nothing client-side can ask it to re-render a shifted view.
 *
 * CONCLUSION: MapLibre GL has NO native per-layer positional-offset
 * mechanism for `raster`-type layers, full stop — a real, confirmed,
 * well-known limitation (matches the public "add a georeferenced image"
 * examples every MapLibre/Mapbox-adjacent write-up on this falls back to,
 * which all reach for a SEPARATE `image`/canvas source instead — not
 * available here without abandoning tiled rendering). The only genuine
 * MapLibre-native technique for actually moving a layer's rendered pixels,
 * that works uniformly for BOTH this registry's raster (cog/xyz) layers AND
 * its geojson (boundary/contour) layers, needs no third-party internals,
 * and is already precedented in this exact component family, is
 * <CompareSwipe>'s own "two independently-cameraed `Map` instances" trick
 * (see CompareSwipe.tsx's header comment for the same research done for
 * ITS problem): a second, small "ghost" `Map` instance, rendering ONLY the
 * currently-selected layer (built via the SAME `buildLayerMapConfig` this
 * whole family shares), camera-mirrored from the real map on every 'move'
 * EXCEPT its `center` is shifted by the NEGATIVE of the desired offset — so
 * content that's geographically at the ghost map's center renders on
 * screen exactly `offsetMeters` away from where it would on the real map
 * (see `computeGhostCenter`'s own doc comment for the sign derivation).
 * The real map's own copy of that one layer is hidden (`visibility: none`,
 * via `buildLayerMapConfig`'s own computed layer ids — never guessed/
 * duplicated naming) for as long as its offset is non-zero, and restored
 * (via the exported `updateLayerOnMap`, which respects whatever the
 * registry's OWN toggle/opacity currently say) the moment the offset goes
 * back to zero, the selection moves to a different layer, or this
 * component unmounts — so there is nothing left over on the real map by
 * construction, same "toggling off cleanly restores normal behavior"
 * guarantee CompareSwipe's own header comment calls out for its panes.
 *
 * Only ONE ghost pane is ever mounted (unlike CompareSwipe's two) — this
 * story's brief is "which registered layer is CURRENTLY being nudged"
 * (singular): other layers' offsets are still tracked in `offsets` state
 * (switching back to a previously-nudged layer restores its own
 * accumulated offset, not zero) but are only rendered — via the one shared
 * ghost pane — while that layer is the active selection.
 */

/** Cumulative alignment offset for one layer, in real-world meters. */
export interface AlignOffset {
  north: number;
  east: number;
}

/** Per-click nudge size. Small enough for the real-world drift this solves
 *  (CLAUDE.md: RTK-less drift is 1-3m) to take a handful of clicks to
 *  correct, not one imprecise jump. */
export const ALIGN_STEP_METERS = 0.25;

/** Meters per degree of latitude — the standard constant (WGS84 mean;
 *  this repo's own LayerViewer.tsx `measureDistanceMeters` similarly uses
 *  a mean-Earth-radius haversine rather than full ellipsoid math for a
 *  visual tool, not a survey instrument — CLAUDE.md is explicit this whole
 *  framework is "visual property-intelligence, NOT survey-grade"). Meters
 *  per degree of LONGITUDE varies with latitude (a degree of longitude
 *  shrinks toward the poles) — computed per-call in `metersToLngLatOffset`
 *  below via `* cos(latitude)`, not a second constant. */
const METERS_PER_DEGREE_LAT = 111_320;

/** Converts a north/east meters offset into the lng/lat delta it
 *  represents AT a given latitude (longitude's real-world meters-per-degree
 *  shrinks by `cos(latitude)` moving away from the equator — a fixed
 *  meters-per-degree constant for longitude would be wrong everywhere
 *  except the equator). Pure and MapLibre-independent — unit-tested
 *  directly against known values (see AlignControl.test.tsx) rather than
 *  only reachable by rendering the full component with a real WebGL map,
 *  same "pull pure logic out of the browser-API-dependent shell" precedent
 *  as LayerViewer.tsx's `measureDistanceMeters`/`buildLayerMapConfig`. */
export function metersToLngLatOffset(offsetMeters: AlignOffset, atLatitude: number): { lng: number; lat: number } {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((atLatitude * Math.PI) / 180);
  return {
    lat: offsetMeters.north / METERS_PER_DEGREE_LAT,
    lng: offsetMeters.east / metersPerDegreeLng,
  };
}

/** The ghost pane's camera center, given the REAL map's current center and
 *  the selected layer's cumulative offset. Deliberately SUBTRACTS the
 *  offset's lng/lat delta (not adds) — a point P at a fixed real-world
 *  position projects to screen position `P - cameraCenter` (in map-
 *  projected space); moving the ghost camera to `mainCenter - offsetDelta`
 *  makes P's ghost-pane screen position `P - (mainCenter - offsetDelta) =
 *  (P - mainCenter) + offsetDelta` — i.e. exactly `offsetMeters` further in
 *  the intended direction than where it renders on the real map. Verified
 *  numerically in AlignControl.test.tsx (a north-nudge must shift the ghost
 *  center SOUTH, not north), not just asserted here. */
export function computeGhostCenter(
  mainCenter: { lng: number; lat: number },
  offsetMeters: AlignOffset,
): { lng: number; lat: number } {
  const delta = metersToLngLatOffset(offsetMeters, mainCenter.lat);
  return { lng: mainCenter.lng - delta.lng, lat: mainCenter.lat - delta.lat };
}

/** Pure reducer: applies a nudge `delta` to `layerId`'s cumulative offset,
 *  returning a NEW offsets record. Every other layer's entry is carried
 *  over untouched (same object reference, not just equal value) — the real
 *  mechanism behind this story's "nudging one layer must not affect any
 *  other layer" requirement, directly unit-tested (not just asserted by
 *  the component's behavior) in AlignControl.test.tsx. */
export function nudgeOffset(
  offsets: Record<string, AlignOffset>,
  layerId: string,
  delta: AlignOffset,
): Record<string, AlignOffset> {
  const current = offsets[layerId] ?? { north: 0, east: 0 };
  return { ...offsets, [layerId]: { north: current.north + delta.north, east: current.east + delta.east } };
}

/** True for the zero offset (the Reset target / the "nothing to hide, show
 *  the real map's own copy of this layer normally" gate). */
export function isZeroOffset(offset: AlignOffset): boolean {
  return offset.north === 0 && offset.east === 0;
}

const DPAD_BUTTON_CLASS =
  "flex h-6 w-6 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:border-accent hover:text-accent";

export interface AlignControlProps {
  /** The SAME ref already passed to the sibling <LayerViewer> being
   *  aligned (`<LayerViewer ref={viewerRef} ... />`) — used to read the
   *  live MapLibre `Map` instance (camera + hide/restore the selected
   *  layer's own map layers), same "escape hatch, read via getMap()"
   *  pattern <CompareSwipe> already uses. */
  viewerRef: RefObject<LayerViewerHandle | null>;
  /** current layer list — the SAME array a sibling <LayerControl> renders
   *  (typically <LayerViewer>'s `onLayersChange`). The layer selector lists
   *  every non-disabled entry with a real `url` (the same "something to
   *  actually add to the map" gate `buildLayerMapConfig` itself applies). */
  layers: LayerDef[];
  /** Fired with the CURRENT cumulative offset every time it changes
   *  (a nudge click or Reset) — this repo has no backend anywhere
   *  (CLAUDE.md), so <AlignControl> owns no persistence of its own; this is
   *  the escape hatch a consuming app uses to own that itself, same
   *  "the viewer doesn't own state it shouldn't" pattern as
   *  <LayerViewer>'s own `onAnnotationsChange`/`onLayersChange`. */
  onAlignmentChange?: (layerId: string, offsetMeters: AlignOffset) => void;
  className?: string;
}

export function AlignControl({ viewerRef, layers, onAlignmentChange, className }: AlignControlProps) {
  const alignableLayers = layers.filter((l) => !l.disabled && l.url);

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Record<string, AlignOffset>>({});

  // Default (and re-default, if the currently-selected id disappears from
  // the registry) the selection to the first alignable layer.
  useEffect(() => {
    setSelectedLayerId((prev) => {
      if (prev && alignableLayers.some((l) => l.id === prev)) return prev;
      return alignableLayers[0]?.id ?? null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alignableLayers
    // is derived fresh from `layers` every render; depending on `layers`
    // itself (not the derived array's identity) is the intentional,
    // narrower dependency — same pattern LayerViewer.tsx's own effects use
    // throughout (e.g. its "Seed the live `layers` state" effect).
  }, [layers]);

  const ghostContainerRef = useRef<HTMLDivElement | null>(null);
  const ghostMapRef = useRef<MapLibreMap | null>(null);
  const ghostReadyRef = useRef(false);
  // The layer id CURRENTLY force-hidden on the real map (or null) — tracked
  // so it can be restored the instant it stops being the active
  // ("selected AND non-zero offset") layer, from whichever code path
  // notices that first (a nudge back to zero, a selection change, or this
  // component unmounting).
  const hiddenLayerIdRef = useRef<string | null>(null);

  // Latest values, read from effects/listeners that shouldn't need to be
  // re-registered on every render — same "avoid stale closures via a ref"
  // pattern LayerViewer.tsx/CompareSwipe.tsx use throughout.
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  const offsetsRef = useRef(offsets);
  useEffect(() => {
    offsetsRef.current = offsets;
  }, [offsets]);
  const selectedLayerIdRef = useRef(selectedLayerId);
  useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId;
  }, [selectedLayerId]);
  const onAlignmentChangeRef = useRef(onAlignmentChange);
  useEffect(() => {
    onAlignmentChangeRef.current = onAlignmentChange;
  }, [onAlignmentChange]);

  // Recomputes the ghost pane's camera from the REAL map's CURRENT camera
  // + the selected layer's CURRENT offset, and hides/restores the real
  // map's own copy of the selected layer as needed. Called from the real
  // map's 'move' listener (pan/zoom) AND directly whenever
  // selectedLayerId/offsets change (a nudge/selection click) — same
  // "recompute on both interaction AND external state change" pattern as
  // LayerViewer.tsx's own `updateMeasureLabelPosition`.
  const syncGhost = useCallback(() => {
    const mainMap = viewerRef.current?.getMap();
    const ghostMap = ghostMapRef.current;
    if (!mainMap || !ghostMap || !ghostReadyRef.current) return;

    const selectedId = selectedLayerIdRef.current;
    const offset = selectedId ? (offsetsRef.current[selectedId] ?? { north: 0, east: 0 }) : { north: 0, east: 0 };
    const active = selectedId !== null && !isZeroOffset(offset);
    const nextHiddenId = active ? selectedId : null;

    // Restore whichever layer was PREVIOUSLY force-hidden, the moment it
    // stops being the active one — via the exported updateLayerOnMap, which
    // respects whatever the registry's OWN toggle/opacity currently say
    // (not a hardcoded "visible") so this never fights a sibling
    // <LayerControl>.
    if (hiddenLayerIdRef.current && hiddenLayerIdRef.current !== nextHiddenId) {
      const prevDef = layersRef.current.find((l) => l.id === hiddenLayerIdRef.current);
      if (prevDef) updateLayerOnMap(mainMap, prevDef);
      hiddenLayerIdRef.current = null;
    }

    const camera = { zoom: mainMap.getZoom(), bearing: mainMap.getBearing(), pitch: mainMap.getPitch() };

    if (active && selectedId) {
      const def = layersRef.current.find((l) => l.id === selectedId);
      if (def) {
        const config = buildLayerMapConfig(def);
        if (config) {
          // Hides ONLY this layer's own computed map-layer ids (from
          // buildLayerMapConfig — never a guessed/duplicated naming
          // scheme), never touching any other layer's ids.
          for (const mapLayer of config.mapLayers) {
            if (mainMap.getLayer(mapLayer.id)) mainMap.setLayoutProperty(mapLayer.id, "visibility", "none");
          }
          hiddenLayerIdRef.current = selectedId;
        }
      }
      ghostMap.jumpTo({ center: computeGhostCenter(mainMap.getCenter(), offset), ...camera });
    } else {
      // Nothing active — keep the (invisible, see the render's `active`
      // gate below) ghost pane's camera mirrored anyway, so the FIRST nudge
      // click doesn't start from a stale/last-known camera.
      ghostMap.jumpTo({ center: mainMap.getCenter(), ...camera });
    }
  }, [viewerRef]);

  // Constructs (and, on selectedLayerId change, tears down + reconstructs)
  // a single ghost `Map` instance showing ONLY the selected layer — same
  // "torn down + rebuilt on identity change, not on every registry edit"
  // shape as CompareSwipe.tsx's own comparison-pane effect (see its own
  // comment for why: a DIFFERENT layer needs a freshly-built source/layer,
  // not a live update of the existing one).
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let unsyncMove: (() => void) | undefined;

    function init() {
      if (cancelled) return;
      const mainMap = viewerRef.current?.getMap();
      const container = ghostContainerRef.current;
      const layerId = selectedLayerIdRef.current;
      if (!mainMap || !container || !layerId) {
        retryTimer = setTimeout(init, 32);
        return;
      }
      const def = layersRef.current.find((l) => l.id === layerId);
      if (!def) return; // nothing to build a ghost pane for

      loadMapLibreModules().then(({ Map }) => {
        if (cancelled) return;

        const ghostMap = new Map({
          container,
          style: { version: 8, sources: {}, layers: [] },
          interactive: false,
          attributionControl: false,
          preserveDrawingBuffer: true,
          center: mainMap.getCenter(),
          zoom: mainMap.getZoom(),
          bearing: mainMap.getBearing(),
          pitch: mainMap.getPitch(),
        });
        ghostMapRef.current = ghostMap;
        ghostReadyRef.current = false;

        ghostMap.on("load", () => {
          const config = buildLayerMapConfig({ ...def, toggle: true });
          if (config) {
            ghostMap.addSource(config.sourceId, config.source);
            for (const mapLayer of config.mapLayers) ghostMap.addLayer(mapLayer);
          }
          ghostReadyRef.current = true;
          syncGhost();
        });

        function onMainMove() {
          syncGhost();
        }
        mainMap.on("move", onMainMove);
        unsyncMove = () => mainMap.off("move", onMainMove);
      });
    }

    init();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsyncMove?.();
      // Restore whatever's currently force-hidden BEFORE tearing the ghost
      // pane down — otherwise switching selection (or unmounting
      // <AlignControl> entirely) would leave the PREVIOUS layer invisible
      // on the real map forever, with nothing left to un-hide it.
      const mainMap = viewerRef.current?.getMap();
      if (mainMap && hiddenLayerIdRef.current) {
        const prevDef = layersRef.current.find((l) => l.id === hiddenLayerIdRef.current);
        if (prevDef) updateLayerOnMap(mainMap, prevDef);
        hiddenLayerIdRef.current = null;
      }
      ghostMapRef.current?.remove();
      ghostMapRef.current = null;
      ghostReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewerRef is a
    // stable ref object by convention (same object identity every render,
    // same assumption CompareSwipe.tsx's identical effect makes);
    // layersRef/selectedLayerIdRef above are the intentional escape hatch
    // for reading CURRENT values without tearing the ghost map down for
    // every registry edit — only a genuine selection change should do that.
  }, [selectedLayerId, syncGhost]);

  // Re-syncs the ghost pane (hide/restore + camera) whenever the offsets
  // record changes — i.e. every nudge/Reset click. Deliberately NOT folded
  // into the ghost-construction effect above: an offset edit must NOT tear
  // down and rebuild the ghost `Map` instance, only reposition it.
  useEffect(() => {
    syncGhost();
  }, [offsets, syncGhost]);

  const handleNudge = useCallback(
    (delta: AlignOffset) => {
      const layerId = selectedLayerIdRef.current;
      if (!layerId) return;
      setOffsets((prev) => {
        const next = nudgeOffset(prev, layerId, delta);
        onAlignmentChangeRef.current?.(layerId, next[layerId]);
        return next;
      });
    },
    [],
  );

  const handleReset = useCallback(() => {
    const layerId = selectedLayerIdRef.current;
    if (!layerId) return;
    setOffsets((prev) => {
      const current = prev[layerId];
      if (!current || isZeroOffset(current)) return prev;
      const next = { ...prev, [layerId]: { north: 0, east: 0 } };
      onAlignmentChangeRef.current?.(layerId, next[layerId]);
      return next;
    });
  }, []);

  const currentOffset: AlignOffset = (selectedLayerId && offsets[selectedLayerId]) || { north: 0, east: 0 };

  return (
    <div
      data-testid="align-control"
      className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/* Ghost pane — see this file's header comment for why a second,
          camera-shifted Map instance is the only real MapLibre-native way
          to reposition a raster (or geojson) layer's rendered pixels.
          pointer-events-none throughout: all real panning/zooming still
          happens on the actual <LayerViewer> map underneath (read via
          viewerRef, never mutated except the selected layer's own
          visibility — see syncGhost). */}
      <div ref={ghostContainerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-auto absolute bottom-3 right-3 flex w-60 flex-col gap-2 rounded-xl border border-border bg-surface/90 p-3 text-xs text-foreground shadow-lg backdrop-blur">
        <span className="font-medium">Align</span>
        {alignableLayers.length === 0 ? (
          <span className="text-muted">No alignable layers</span>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-muted">Layer</span>
              <select
                value={selectedLayerId ?? ""}
                onChange={(e) => setSelectedLayerId(e.target.value || null)}
                aria-label="Layer being aligned"
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs capitalize text-foreground"
              >
                {alignableLayers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-3 grid-rows-3 place-items-center gap-1 self-center">
              <div />
              <button
                type="button"
                aria-label="Nudge north"
                onClick={() => handleNudge({ north: ALIGN_STEP_METERS, east: 0 })}
                className={DPAD_BUTTON_CLASS}
              >
                ▲
              </button>
              <div />
              <button
                type="button"
                aria-label="Nudge west"
                onClick={() => handleNudge({ north: 0, east: -ALIGN_STEP_METERS })}
                className={DPAD_BUTTON_CLASS}
              >
                ◀
              </button>
              <span className="text-[9px] text-muted">N/E</span>
              <button
                type="button"
                aria-label="Nudge east"
                onClick={() => handleNudge({ north: 0, east: ALIGN_STEP_METERS })}
                className={DPAD_BUTTON_CLASS}
              >
                ▶
              </button>
              <div />
              <button
                type="button"
                aria-label="Nudge south"
                onClick={() => handleNudge({ north: -ALIGN_STEP_METERS, east: 0 })}
                className={DPAD_BUTTON_CLASS}
              >
                ▼
              </button>
              <div />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Offset</span>
              <span className="font-mono text-foreground">
                {currentOffset.north.toFixed(2)}m N, {currentOffset.east.toFixed(2)}m E
              </span>
            </div>

            <button
              type="button"
              onClick={handleReset}
              disabled={isZeroOffset(currentOffset)}
              className="self-start rounded-full border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:text-muted disabled:hover:border-border disabled:hover:text-muted"
            >
              Reset
            </button>
          </>
        )}
      </div>
    </div>
  );
}
