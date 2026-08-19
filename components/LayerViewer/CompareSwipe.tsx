"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
// Pure CSS — safe to import statically, same rationale as LayerViewer.tsx's
// own identical import (never evaluates JS, never touches Worker/window).
import "maplibre-gl/dist/maplibre-gl.css";
import type { LayerDef } from "@/lib/layer-types";
import type { LayerViewerHandle } from "./LayerViewer";
import {
  BASEMAP_LAYER_ID,
  BASEMAP_SOURCE_ID,
  buildLayerMapConfig,
  ESRI_ATTRIBUTION,
  ESRI_WORLD_IMAGERY_URL,
  loadMapLibreModules,
  updateLayerOnMap,
} from "./LayerViewer";
import { cx } from "./cx";

/**
 * <CompareSwipe> — layerviewer-phase2-tools epic's CompareSwipe story. A
 * draggable vertical divider over an already-mounted <LayerViewer>: the
 * region left of the divider shows `layerA`, the region right of it shows
 * `layerB`, dragging moves the split point (0-100, controlled or
 * uncontrolled).
 *
 * THE REAL QUESTION THIS STORY ASKS ("don't guess and build the wrong
 * thing"): what's the MapLibre-GL-native technique for a swipe/compare
 * divider? Researched directly (not assumed) before writing anything below:
 *
 * - `mapbox-gl-compare` is Mapbox-GL-specific, but MapLibre has its own
 *   maintained port at the exact same technique: `@maplibre/maplibre-gl-compare`
 *   (published under the `maplibreorg` npm account). Its own docs/usage
 *   pattern is unambiguous: **two separate `Map` instances** (`#before`/
 *   `#after` containers), each with its own style, kept camera-synced, with
 *   the "after" map's container CSS `clip-path`-ed to the divider position.
 * - A newer, actively-maintained community package aimed more directly at
 *   "swipe between LAYERS on one map" (`maplibre-gl-swipe`, opengeos/giswqs,
 *   last published within days of this story) advertises a `leftLayers`/
 *   `rightLayers` API against a single map — but its own source
 *   (`src/lib/core/SwipeControl.ts`) says outright, in its own header
 *   comment: **"Uses a dual-map approach with CSS clip-path for true
 *   split-screen comparison"** — it manages layer VISIBILITY on the
 *   already-existing map for the "left" side, but still constructs one
 *   additional real `Map` instance (its own `_comparisonMap`) for the
 *   "right" side, clipped via CSS `clip-path` on that second map's
 *   container, camera-mirrored from the first.
 * - There is no MapLibre paint property, filter, or "mask" primitive that
 *   clips an individual LAYER to a screen-space rectangle. A `Map` renders
 *   every one of its visible layers into ONE shared WebGL canvas/bitmap —
 *   CSS `clip-path` on that canvas element clips ALL of it, not one layer
 *   within it. So "single map instance, two paint-layer variants clipped
 *   via a runtime-updated mask/paint-property" (one of the candidate
 *   techniques this story asked to rule in/out) does not exist as a real,
 *   supported MapLibre mechanism — confirmed by there being no such
 *   paint/layout property in the style spec, and by every real
 *   implementation above reaching for a second canvas instead.
 *
 * CONCLUSION: CSS `clip-path` over two separate, camera-synced live map
 * canvases is the only genuine MapLibre-native technique for this. What
 * differs below from the two precedents above is scope, chosen to fit
 * THIS component's shape specifically: `layerA`/`layerB` are two entries
 * already living in <LayerViewer>'s OWN layer registry/map (not two whole
 * separate styles/datasets the way mapbox-gl-compare's "before/after"
 * usually are), and <LayerViewer>'s main map is a sibling component this
 * file must not reach into and mutate (measure/annotate tools already live
 * there — see LayerViewer.tsx's header comment on why <LayerViewer> and
 * <LayerControl> stay independent siblings; this story adds a THIRD
 * sibling, not a patch to LayerViewer.tsx's internals).
 *
 * So: <CompareSwipe> owns exactly TWO of its own small `Map` instances
 * (not the "before/after, whole scene" shape the two precedents use) — one
 * rendering ONLY `layerA` + the same Esri basemap, one rendering ONLY
 * `layerB` + the same basemap — reusing `buildLayerMapConfig` (this
 * component's SAME pure registry→MapLibre-config function) so a compared
 * layer renders identically to how it would on the main map. Both panes
 * are absolutely-positioned, full-bleed, and stacked as an overlay on top
 * of wherever a consumer places <CompareSwipe> (same "independent,
 * plug-and-play sibling positioned by the consumer" pattern as
 * <LayerControl> — see index.ts). The right/`layerB` pane sits on top and
 * is the one that's actually CSS-`clip-path`-ed to the divider position;
 * the left/`layerA` pane underneath is always full-bleed (needs no clip of
 * its own — the right pane simply doesn't cover it past the divider).
 * Camera is mirrored ONE-DIRECTIONALLY from <LayerViewer>'s real map (read
 * via `viewerRef.getMap()`) on every 'move' — both compare panes are
 * `interactive: false` with `pointer-events: none` on their DOM (except the
 * divider handle itself), so all real panning/zooming still happens on the
 * ACTUAL <LayerViewer> map underneath (which stays fully untouched/
 * unmutated the entire time <CompareSwipe> is mounted) and the two compare
 * panes just follow along.
 *
 * WHY THIS MATTERS FOR THE "TOGGLING OFF CLEANLY RESTORES NORMAL BEHAVIOR"
 * REQUIREMENT: because <CompareSwipe> never calls `setLayoutProperty`/
 * `setPaintProperty`/anything else on <LayerViewer>'s own map, there is
 * nothing on that map to restore. A consumer "turns CompareSwipe off" by
 * simply not rendering it (`{compareOn && <CompareSwipe ... />}`, same
 * pattern as any other conditionally-rendered sibling) — unmounting tears
 * down this component's own two extra `Map` instances (this file's
 * cleanup effect below) and nothing else, so there is no clip/mask
 * artifact left anywhere near the real map by construction, not by
 * carefully undoing state.
 *
 * BOUNDARY CASES (0% and 100%): `clip-path: inset(0 0 0 <value>%)` on the
 * right/`layerB` pane crops away `<value>%` of ITS OWN left edge. At
 * `value = 0` that's a zero-width crop — the layerB pane is completely
 * unclipped and covers the full container edge-to-edge, so 100% of what's
 * visible is `layerB` (the `layerA` pane underneath is fully occluded, but
 * still rendering — cheap to leave running, avoids add/remove churn on
 * every drag frame). At `value = 100` the crop is the full container width
 * — the `layerB` pane is clipped to nothing, so the `layerA` pane
 * underneath shows through edge-to-edge, 100% `layerA`. Neither boundary
 * ever produces a blank strip or double-render seam: there's no gap
 * between "clipped away" and "the other pane showing through" because the
 * left pane is ALWAYS full-bleed underneath, not itself clipped or
 * conditionally rendered.
 */

const CAMERA_SYNC_POLL_MS = 32;

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Builds one comparison pane's (layer + basemap) content once its `Map`
 *  has fired 'load'. Mirrors LayerViewer.tsx's own 'load' handler's
 *  "look up the current LayerDef, build its config, add it" shape, scoped
 *  to a single layer id. Forces `toggle: true` regardless of the
 *  registry's own toggle state — the whole point of naming a layer as
 *  `layerA`/`layerB` is to see it while comparing, independent of whatever
 *  a sibling <LayerControl> currently has that layer's checkbox set to.
 *  Opacity IS respected (not forced to 1) so the compared pane matches
 *  what the layer would actually look like on the main map. No-op
 *  (basemap-only pane) if the id isn't found in `layers`, is a disabled
 *  stub, or has no url — same "nothing to add" cases buildLayerMapConfig
 *  itself already handles, just surfaced here instead of thrown. */
function addComparisonPane(map: MapLibreMap, layerId: string, layers: LayerDef[]) {
  const def = layers.find((l) => l.id === layerId);
  if (!def) return;
  const config = buildLayerMapConfig({ ...def, toggle: true });
  if (!config) return;
  if (!map.getSource(config.sourceId)) {
    map.addSource(config.sourceId, config.source);
  }
  for (const mapLayer of config.mapLayers) {
    if (!map.getLayer(mapLayer.id)) {
      map.addLayer(mapLayer);
    }
  }
}

export interface CompareSwipeProps {
  /** The SAME ref already passed to the sibling <LayerViewer> this compare
   *  pane augments (`<LayerViewer ref={viewerRef} ... />`) — used only to
   *  read the live MapLibre `Map` instance (`getMap()`) for camera sync.
   *  <CompareSwipe> polls this every `CAMERA_SYNC_POLL_MS` until non-null
   *  (the main map is constructed asynchronously — see LayerViewer.tsx's
   *  `loadMapLibreModules()` — so it's very commonly still null on
   *  <CompareSwipe>'s first mount). */
  viewerRef: RefObject<LayerViewerHandle | null>;
  /** current layer list — the SAME array a sibling <LayerControl> renders
   *  (typically <LayerViewer>'s `onLayersChange`). `layerA`/`layerB` are
   *  looked up in here by id; opacity edits made via <LayerControl> stay
   *  live-synced onto the comparison panes for as long as they're
   *  mounted. */
  layers: LayerDef[];
  /** id of the layer shown LEFT of the divider (from `layers`). */
  layerA: string;
  /** id of the layer shown RIGHT of the divider (from `layers`). */
  layerB: string;
  /** controlled divider position, 0-100 (percent of the container's width,
   *  measured from the left, currently occupied by `layerA`). Omit for
   *  uncontrolled — see `defaultValue`. */
  value?: number;
  /** initial divider position when uncontrolled (`value` omitted).
   *  Default 50 (centered). */
  defaultValue?: number;
  /** fired with the new position (already clamped 0-100) on every drag
   *  move / keyboard nudge, whether controlled or uncontrolled. */
  onChange?: (value: number) => void;
  className?: string;
}

export function CompareSwipe({
  viewerRef,
  layers,
  layerA,
  layerB,
  value,
  defaultValue = 50,
  onChange,
  className,
}: CompareSwipeProps) {
  const isControlled = value !== undefined;
  const [internalPercent, setInternalPercent] = useState(() => clampPercent(defaultValue));
  const percent = clampPercent(isControlled ? (value as number) : internalPercent);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const leftContainerRef = useRef<HTMLDivElement | null>(null);
  const rightContainerRef = useRef<HTMLDivElement | null>(null);
  const leftMapRef = useRef<MapLibreMap | null>(null);
  const rightMapRef = useRef<MapLibreMap | null>(null);
  const leftReadyRef = useRef(false);
  const rightReadyRef = useRef(false);
  const draggingRef = useRef(false);

  // Latest values, read from effects/listeners that shouldn't need to be
  // re-registered on every render — same "avoid stale closures via a ref"
  // pattern LayerViewer.tsx uses throughout (layersRef, onLayersChangeRef,
  // etc).
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  const layerARef = useRef(layerA);
  const layerBRef = useRef(layerB);
  useEffect(() => {
    layerARef.current = layerA;
    layerBRef.current = layerB;
  }, [layerA, layerB]);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const emitPercent = useCallback(
    (next: number) => {
      const clamped = clampPercent(next);
      if (!isControlled) setInternalPercent(clamped);
      onChangeRef.current?.(clamped);
    },
    [isControlled],
  );

  // Construct the two comparison panes once the main <LayerViewer> map
  // exists (polled — see viewerRef's own doc comment above), and tear them
  // down on unmount OR whenever layerA/layerB's IDENTITY changes (a
  // different pair of layers needs freshly-built sources/layers, not a
  // live update of the existing ones). Deliberately NOT re-run just
  // because `layers` (the registry array) changes — opacity edits are
  // handled by the separate live-sync effect below without tearing
  // anything down.
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let unsyncMove: (() => void) | undefined;

    function init() {
      if (cancelled) return;
      const mainMap = viewerRef.current?.getMap();
      const leftContainer = leftContainerRef.current;
      const rightContainer = rightContainerRef.current;
      if (!mainMap || !leftContainer || !rightContainer) {
        retryTimer = setTimeout(init, CAMERA_SYNC_POLL_MS);
        return;
      }

      loadMapLibreModules().then(({ Map }) => {
        if (cancelled) return;

        const camera = {
          center: mainMap.getCenter(),
          zoom: mainMap.getZoom(),
          bearing: mainMap.getBearing(),
          pitch: mainMap.getPitch(),
        };
        const baseStyle = {
          version: 8 as const,
          sources: {
            [BASEMAP_SOURCE_ID]: {
              type: "raster" as const,
              tiles: [ESRI_WORLD_IMAGERY_URL],
              tileSize: 256,
              attribution: ESRI_ATTRIBUTION,
            },
          },
          layers: [{ id: BASEMAP_LAYER_ID, type: "raster" as const, source: BASEMAP_SOURCE_ID }],
        };

        const leftMap = new Map({
          container: leftContainer,
          style: baseStyle,
          interactive: false,
          attributionControl: false,
          preserveDrawingBuffer: true,
          ...camera,
        });
        const rightMap = new Map({
          container: rightContainer,
          style: baseStyle,
          interactive: false,
          attributionControl: false,
          preserveDrawingBuffer: true,
          ...camera,
        });
        leftMapRef.current = leftMap;
        rightMapRef.current = rightMap;
        leftReadyRef.current = false;
        rightReadyRef.current = false;

        leftMap.on("load", () => {
          addComparisonPane(leftMap, layerARef.current, layersRef.current);
          leftReadyRef.current = true;
        });
        rightMap.on("load", () => {
          addComparisonPane(rightMap, layerBRef.current, layersRef.current);
          rightReadyRef.current = true;
        });

        // One-directional camera mirror: the REAL map (still fully
        // interactive underneath — see this file's header comment) is the
        // only source of truth. jumpTo (not easeTo/flyTo) so the panes
        // track every intermediate frame of a drag-pan/zoom instantly,
        // with no lag or animation of their own to fall behind by.
        function syncFromMain() {
          const next = {
            center: mainMap!.getCenter(),
            zoom: mainMap!.getZoom(),
            bearing: mainMap!.getBearing(),
            pitch: mainMap!.getPitch(),
          };
          leftMap.jumpTo(next);
          rightMap.jumpTo(next);
        }
        mainMap.on("move", syncFromMain);
        unsyncMove = () => mainMap.off("move", syncFromMain);
      });
    }

    init();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsyncMove?.();
      leftMapRef.current?.remove();
      rightMapRef.current?.remove();
      leftMapRef.current = null;
      rightMapRef.current = null;
      leftReadyRef.current = false;
      rightReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewerRef is a
    // stable ref object by convention (same object identity every render);
    // layersRef/layerARef/layerBRef above are the intentional escape hatch
    // for reading CURRENT layers/ids without tearing down + rebuilding both
    // maps on every keystroke of an opacity slider.
  }, [layerA, layerB]);

  // Live-sync opacity (NOT toggle — see addComparisonPane's own doc
  // comment for why toggle stays forced-on) onto each already-added pane
  // whenever the registry changes, e.g. a sibling <LayerControl>'s opacity
  // slider — without tearing down/recreating either Map instance. No-op
  // until that pane's own 'load' has fired (mirrors LayerViewer.tsx's own
  // "no-op if the layer hasn't been added yet" guard in its identically-
  // named updateLayerOnMap caller).
  useEffect(() => {
    const leftDef = layers.find((l) => l.id === layerA);
    if (leftMapRef.current && leftReadyRef.current && leftDef) {
      updateLayerOnMap(leftMapRef.current, { ...leftDef, toggle: true });
    }
    const rightDef = layers.find((l) => l.id === layerB);
    if (rightMapRef.current && rightReadyRef.current && rightDef) {
      updateLayerOnMap(rightMapRef.current, { ...rightDef, toggle: true });
    }
  }, [layers, layerA, layerB]);

  const moveDividerToClientX = useCallback(
    (clientX: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      if (rect.width === 0) return;
      emitPercent(((clientX - rect.left) / rect.width) * 100);
    },
    [emitPercent],
  );

  // Drag continues even once the pointer leaves the (intentionally thin)
  // handle element — listened at `window`, not the handle itself — same
  // "don't lose the drag just because the cursor moved a few px off a
  // narrow target" affordance any slider/divider needs. Pointer Events
  // (not separate mouse/touch listener pairs) is the MapLibre-adjacent
  // ecosystem's own standard here too (MapLibre's own drag handlers use
  // pointer events internally as of v3+) and natively unifies mouse, touch,
  // and pen under one event type/coordinate space, which is what "responds
  // to both mouse and touch input" actually needs.
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      moveDividerToClientX(e.clientX);
    }
    function onPointerUp() {
      draggingRef.current = false;
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [moveDividerToClientX]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        // jsdom / older browsers may not implement pointer capture at all
        // — harmless to skip; the window-level listeners above already
        // carry the drag regardless of capture.
      }
      moveDividerToClientX(e.clientX);
    },
    [moveDividerToClientX],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        emitPercent(percent - step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        emitPercent(percent + step);
      } else if (e.key === "Home") {
        e.preventDefault();
        emitPercent(0);
      } else if (e.key === "End") {
        e.preventDefault();
        emitPercent(100);
      }
    },
    [emitPercent, percent],
  );

  return (
    <div
      ref={wrapperRef}
      data-testid="compare-swipe"
      className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/* Left pane (`layerA`) — always full-bleed underneath the right
          pane. Never itself clipped: see this file's header comment for
          why that's what makes both 0%/100% boundary cases render exactly
          one layer with no blank strip. */}
      <div ref={leftContainerRef} className="absolute inset-0 h-full w-full" />

      {/* Right pane (`layerB`) — the one CSS `clip-path` actually clips.
          inset(0 0 0 <percent>%) crops away `percent`% of ITS OWN left
          edge — see the boundary-case walkthrough in this file's header
          comment for the 0%/100% derivation. */}
      <div
        ref={rightContainerRef}
        className="absolute inset-0 h-full w-full"
        style={{ clipPath: `inset(0 0 0 ${percent}%)` }}
      />

      {/* Divider handle — the ONLY pointer-events:auto region in this
          whole overlay (the wrapper + both panes above are pointer-events
          none), so dragging it never steals a pan/zoom gesture meant for
          the real <LayerViewer> map underneath. Styled with the exact
          same design tokens <LayerControl>'s own panel uses
          (border-accent/bg-accent active state, bg-surface/90 +
          border-border + shadow-lg + backdrop-blur for the grip) for
          cross-component visual consistency. */}
      <div
        role="slider"
        aria-label="Compare divider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        className="pointer-events-auto absolute inset-y-0 z-10 flex w-6 -translate-x-1/2 cursor-ew-resize items-center justify-center touch-none"
        style={{ left: `${percent}%` }}
      >
        <div className="h-full w-0.5 bg-accent shadow-lg" />
        <div className="absolute h-8 w-8 rounded-full border-2 border-accent bg-surface shadow-lg" />
      </div>

      {/* Label chip — bottom-right, deliberately distinct from the Measure
          panel's bottom-left slot and the Annotate panel's top-left slot
          (see LayerViewer.tsx's own panel-placement comments) so all three
          can be mounted together without colliding. Same bg-surface/90 +
          border-border + rounded-xl + backdrop-blur panel look as every
          other panel in this component family. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-1.5 rounded-xl border border-border bg-surface/90 px-3 py-1.5 text-xs text-foreground shadow-lg backdrop-blur">
          <span className="font-medium capitalize">{layerA}</span>
          <span className="text-muted">vs</span>
          <span className="font-medium capitalize">{layerB}</span>
        </div>
      </div>
    </div>
  );
}
