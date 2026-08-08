"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
// Type-only imports — erased entirely at compile time (isolatedModules
// requires the explicit `type` keyword for that erasure to be guaranteed).
// Deliberately NOT a value import: see loadMapLibreModules() below for why
// the actual `maplibre-gl` / cog-protocol modules are loaded lazily inside
// an effect instead of at module scope.
import type {
  LayerSpecification,
  Map as MapLibreMap,
  RasterTileSource,
  SourceSpecification,
} from "maplibre-gl";
// Pure CSS, no JS evaluation — safe to import statically (unlike the JS
// modules below, it never touches `Worker`/`window` and doesn't need to be
// deferred to stay SSR-safe).
import "maplibre-gl/dist/maplibre-gl.css";
import type { LayerDef, PropertyLayers } from "@/lib/layer-types";
// Type-only — see GeoAnchoredModel's own header comment for why this is a
// deliberately different shape from Model3D's `ModelDef`.
import type { GeoAnchoredModel } from "@/lib/geo-model-types";
// A real value import (not lazy): unlike "maplibre-gl" itself,
// lib/maplibre-model-layer.ts only touches browser-only globals INSIDE
// createModelLayer()'s onAdd (behind its own lazy loadRenderingModules()) —
// its top-level imports are all `import type`, so statically importing
// createModelLayer here has no module-load-time side effect and doesn't
// need the loadMapLibreModules()-style lazy-import treatment.
import { createModelLayer } from "@/lib/maplibre-model-layer";
import { cx } from "./cx";

/**
 * <LayerViewer> — CLAUDE.md's "the core" component / CBA's `MapLayerViewer`.
 * A MapLibre GL map with an Esri World Imagery satellite base and the typed
 * layer registry (lib/layer-types.ts) draped over it as real, toggleable,
 * opacity-controlled sources/layers.
 *
 * STATE-OWNERSHIP CHOICE (docs/components/layer-viewer.md's Behavior section
 * describes <LayerControl> driving "the corresponding MapLibre layer's
 * visibility/opacity paint property live" but doesn't pin down which
 * component owns the source-of-truth array; the story explicitly allows
 * either lifting state to a small wrapper or having <LayerViewer> own it
 * internally with an imperative handle, and says to pick whichever is
 * simpler/more idiomatic when the doc doesn't resolve it):
 *
 * <LayerViewer> owns the live `layers` state internally (it already has to
 * own manifest-resolution state — fetch-if-string, same as <VideoTour> —
 * so folding toggle/opacity into that same internal state avoids a second,
 * redundant source of truth). It exposes that state to a consumer two ways:
 *   - `onLayersChange(layers)` — fired on every change (initial resolve,
 *     every toggle/opacity edit) so a sibling <LayerControl> can render the
 *     current values.
 *   - a `ref` exposing `{ toggleLayer, setOpacity, getLayers }` — so that
 *     sibling <LayerControl>'s onToggle/onOpacityChange callbacks have
 *     somewhere to write back to.
 * This keeps <LayerViewer> and <LayerControl> fully independent, sibling,
 * plug-and-play components (neither imports the other) — a consumer wires
 * them with ~5 lines (see index.ts's usage note), which fits this pair
 * better than <VideoTour>'s tightly-coupled internal composition of
 * TourStage/DoorwayControls/FloorPlanMap: those are fixed UI chrome
 * overlaid on one stage, whereas a map surface and a control panel are two
 * independently-placeable regions a consumer may want to lay out
 * differently (overlay vs. sidebar), so lifting the wiring to the consumer
 * (via ref + callback, not a forced internal layout) is the more flexible,
 * idiomatic fit here.
 */

const ESRI_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Esri, Maxar, Earthstar Geographics, and the GIS User Community";

const BASEMAP_SOURCE_ID = "esri-world-imagery";
const BASEMAP_LAYER_ID = "esri-world-imagery-layer";

function mapSourceId(layerId: string): string {
  return `layer-${layerId}`;
}
function mapRasterLayerId(layerId: string): string {
  return `layer-${layerId}-raster`;
}
function mapFillLayerId(layerId: string): string {
  return `layer-${layerId}-fill`;
}
function mapLineLayerId(layerId: string): string {
  return `layer-${layerId}-line`;
}
function cogSourceUrl(url: string): string {
  return `cog://${url}`;
}

// `maplibre-gl` (and transitively @geomatico/maplibre-cog-protocol) touch
// browser-only globals (Worker, among others) as a *module-load-time* side
// effect, not just when a Map is constructed. Even though this component
// is 'use client' and gets mounted via next/dynamic({ssr:false}) by
// consumers, a plain top-level `import maplibregl from "maplibre-gl"` here
// still gets pulled into the server bundle and evaluated during Next's
// static-prerendering pass the moment ANYTHING in this module is
// statically imported from a page (e.g. this repo's index.ts barrel also
// exports the SSR-safe <LayerControl> — a page that only wants
// <LayerControl> still transitively evaluates this file). That crashed
// `next build` with `ReferenceError: Worker is not defined`. Loading both
// modules lazily, inside the effect below (which only ever runs in the
// browser, after mount), decouples "this file gets imported" from "this
// browser-only package gets evaluated" — fixing that regardless of which
// import path (static or next/dynamic) pulls this file in.
let mapLibreModulesPromise: Promise<{ Map: typeof MapLibreMap }> | null = null;
let cogProtocolRegistered = false;

function loadMapLibreModules() {
  if (!mapLibreModulesPromise) {
    mapLibreModulesPromise = Promise.all([
      import("maplibre-gl"),
      import("@geomatico/maplibre-cog-protocol"),
    ]).then(([maplibregl, cogModule]) => {
      // addProtocol registers into a module-wide registry keyed by scheme
      // name — calling it again from a second <LayerViewer> mount is
      // harmless (just overwrites with the same handler) but pointless.
      if (!cogProtocolRegistered) {
        maplibregl.addProtocol("cog", cogModule.cogProtocol);
        cogProtocolRegistered = true;
      }
      return { Map: maplibregl.Map };
    });
  }
  return mapLibreModulesPromise;
}

/** One layer's computed MapLibre source + the layer(s) that source backs —
 *  exactly the arguments `map.addSource`/`map.addLayer` would be called
 *  with, without actually calling them. */
export interface LayerMapConfig {
  sourceId: string;
  source: SourceSpecification;
  mapLayers: LayerSpecification[];
}

/** Pure registry→MapLibre-config mapping: given a LayerDef, computes the
 *  source + layer(s) config `addLayerToMap` below WOULD hand to
 *  `map.addSource`/`map.addLayer` — with no MapLibre API calls at all, so
 *  it's unit-testable without a real WebGL-backed Map instance (see
 *  LayerViewer.test.tsx).
 *
 *  Returns `null` for `disabled: true` entries (no source/layer at all —
 *  the real "killer feature preview" skip, not a cosmetic hide — see
 *  docs/components/layer-viewer.md) and for live entries with no `url`
 *  (the type contract only *requires* `url: null` for disabled stubs, but
 *  doesn't forbid a live entry with no url; there's nothing to add). */
export function buildLayerMapConfig(layer: LayerDef): LayerMapConfig | null {
  if (layer.disabled) return null;
  if (!layer.url) return null;

  const sourceId = mapSourceId(layer.id);
  const visibility = layer.toggle ? "visible" : "none";

  if (layer.type === "raster") {
    const format = layer.format ?? "cog";
    // Pre-tiled XYZ/PMTiles raster template vs. a single georeferenced
    // COG/GeoTIFF (via the "cog://" protocol) — the registry's documented
    // 'xyz'/'cog' distinction (lib/layer-types.ts's `format` field).
    const source: SourceSpecification =
      format === "xyz"
        ? { type: "raster", tiles: [layer.url], tileSize: 256 }
        : { type: "raster", url: cogSourceUrl(layer.url), tileSize: 256 };

    return {
      sourceId,
      source,
      mapLayers: [
        {
          id: mapRasterLayerId(layer.id),
          type: "raster",
          source: sourceId,
          layout: { visibility },
          paint: { "raster-opacity": layer.opacity },
        },
      ],
    };
  }

  return {
    sourceId,
    source: { type: "geojson", data: layer.url },
    mapLayers: [
      // Fill + line pair so a polygon boundary reads as both a tinted
      // area and a crisp outline — matches the spec's "fill/line layer"
      // wording.
      {
        id: mapFillLayerId(layer.id),
        type: "fill",
        source: sourceId,
        layout: { visibility },
        paint: { "fill-color": "#22c55e", "fill-opacity": layer.opacity * 0.25 },
      },
      {
        id: mapLineLayerId(layer.id),
        type: "line",
        source: sourceId,
        layout: { visibility },
        paint: { "line-color": "#22c55e", "line-width": 2, "line-opacity": layer.opacity },
      },
    ],
  };
}

/** Adds a non-disabled LayerDef's MapLibre source + layer(s), by computing
 *  the config via buildLayerMapConfig() above and handing it to the real
 *  MapLibre API. Disabled entries never reach this function — see the
 *  caller's `if (layer.disabled) continue;` branch, which is the real "no
 *  source/layer added" behavior. */
function addLayerToMap(map: MapLibreMap, layer: LayerDef) {
  const config = buildLayerMapConfig(layer);
  if (!config) {
    if (!layer.disabled && !layer.url) {
      console.warn(`[LayerViewer] layer "${layer.id}" has no url and is not disabled — skipping.`);
    }
    return;
  }

  map.addSource(config.sourceId, config.source);
  for (const mapLayer of config.mapLayers) {
    map.addLayer(mapLayer);
  }
}

/** Pushes a LayerDef's current toggle/opacity onto its already-added
 *  MapLibre layer(s). No-op if the layer's map layer doesn't exist yet
 *  (not added yet) or the layer is disabled (never had one added). */
function updateLayerOnMap(map: MapLibreMap, layer: LayerDef) {
  if (layer.disabled) return;
  const visibility = layer.toggle ? "visible" : "none";

  if (layer.type === "raster") {
    const id = mapRasterLayerId(layer.id);
    if (!map.getLayer(id)) return;
    map.setLayoutProperty(id, "visibility", visibility);
    map.setPaintProperty(id, "raster-opacity", layer.opacity);
  } else {
    const fillId = mapFillLayerId(layer.id);
    const lineId = mapLineLayerId(layer.id);
    if (map.getLayer(fillId)) {
      map.setLayoutProperty(fillId, "visibility", visibility);
      map.setPaintProperty(fillId, "fill-opacity", layer.opacity * 0.25);
    }
    if (map.getLayer(lineId)) {
      map.setLayoutProperty(lineId, "visibility", visibility);
      map.setPaintProperty(lineId, "line-opacity", layer.opacity);
    }
  }
}

/** Pure(ish) manifest resolution: given a `PropertyLayers | string` prop
 *  value, returns the resolved `PropertyLayers` — fetching + parsing JSON
 *  if given a URL string, or resolving immediately with the object as-is.
 *  Extracted out of the manifest-resolution effect below so it's
 *  unit-testable directly (mock `fetch`, no component render, no MapLibre
 *  involved at all — see LayerViewer.test.tsx) instead of only reachable
 *  by rendering the full component, which needs a real WebGL context. */
export async function resolveManifest(manifest: PropertyLayers | string): Promise<PropertyLayers> {
  if (typeof manifest === "string") {
    const res = await fetch(manifest);
    if (!res.ok) throw new Error(`Failed to load layer manifest (${res.status})`);
    return (await res.json()) as PropertyLayers;
  }
  return manifest;
}

export interface LayerViewerHandle {
  /** Set (or toggle, if `toggle` omitted) a layer's visibility. No-op for
   *  unknown or disabled ids. */
  toggleLayer: (id: string, toggle?: boolean) => void;
  /** Set a layer's opacity (clamped 0-1). No-op for unknown or disabled ids. */
  setOpacity: (id: string, opacity: number) => void;
  /** Current live layer list (post manifest-resolution). */
  getLayers: () => LayerDef[];
}

export interface LayerViewerProps {
  /** manifest object or a URL to layers.json — resolved via fetch if a
   *  string, used directly if an object. Same pattern as <VideoTour>'s
   *  `manifest` prop. */
  manifest: PropertyLayers | string;
  /** Fired whenever the live layer list changes: once on initial resolve,
   *  then again on every toggle/opacity edit (including ones driven through
   *  the imperative handle by a sibling <LayerControl>). */
  onLayersChange?: (layers: LayerDef[]) => void;
  /** Fired if the manifest fails to load. */
  onLoadError?: (message: string) => void;
  /** Optional geo-anchored 3D models (lib/geo-model-types.ts) to drape onto
   *  the map via lib/maplibre-model-layer.ts's `createModelLayer()` — the
   *  land-overlay epic's custom-layer 3D-model engine. Diffed by `id`
   *  against what's currently on the map on every change: an entry added
   *  to this array gets `map.addLayer(createModelLayer(model))`'d, an
   *  entry removed gets `map.removeLayer(id)`'d (which triggers the custom
   *  layer's own `onRemove` — see maplibre-model-layer.ts's "Correction 5"
   *  cleanup). Omitted entirely (the default) is fully backward
   *  compatible: no model-layer code path runs at all. */
  models?: GeoAnchoredModel[];
  className?: string;
}

export const LayerViewer = forwardRef<LayerViewerHandle, LayerViewerProps>(function LayerViewer(
  { manifest, models, onLayersChange, onLoadError, className },
  ref,
) {
  const [propertyLayers, setPropertyLayers] = useState<PropertyLayers | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerDef[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapReadyRef = useRef(false);
  const firstFitDoneRef = useRef(false);

  // Latest layers, read from the async 'load' handler and fitBounds
  // listener below without needing `layers` in their dependency arrays.
  const layersRef = useRef<LayerDef[]>([]);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  // Latest `models` prop, read from the 'load' handler's initial add below
  // without needing it in that effect's dependency array — mirrors
  // layersRef immediately above. addedModelIdsRef tracks which model ids
  // are CURRENTLY added to the map as custom layers, so both the initial
  // add and the models-sync effect below can diff by id instead of
  // blindly re-adding/removing everything on every change.
  const modelsRef = useRef<GeoAnchoredModel[]>(models ?? []);
  useEffect(() => {
    modelsRef.current = models ?? [];
  }, [models]);
  const addedModelIdsRef = useRef<Set<string>>(new Set());

  // Latest callbacks, read from effects without re-firing just because the
  // caller passed a new inline function each render (same pattern as
  // VideoTour's onRoomChangeRef).
  const onLayersChangeRef = useRef(onLayersChange);
  useEffect(() => {
    onLayersChangeRef.current = onLayersChange;
  }, [onLayersChange]);
  const onLoadErrorRef = useRef(onLoadError);
  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  // Resolve the manifest: fetch if given a URL, use as-is if given a
  // PropertyLayers object. Mirrors VideoTour.tsx's manifest-resolution effect.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    if (typeof manifest === "string") setPropertyLayers(null);

    resolveManifest(manifest)
      .then((data) => {
        if (!cancelled) setPropertyLayers(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setLoadError(message);
          onLoadErrorRef.current?.(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [manifest]);

  // Seed the live `layers` state once the manifest resolves.
  useEffect(() => {
    if (!propertyLayers) return;
    setLayers(propertyLayers.layers);
  }, [propertyLayers]);

  // Notify the consumer + sync the map on every live layers change
  // (guarded on `propertyLayers` so this doesn't fire a spurious `[]`
  // before the manifest has resolved).
  useEffect(() => {
    if (!propertyLayers) return;
    onLayersChangeRef.current?.(layers);
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    for (const layer of layers) {
      updateLayerOnMap(map, layer);
    }
  }, [layers, propertyLayers]);

  // Create the map exactly once, as soon as the manifest has resolved and
  // the container div exists. Adds the Esri satellite basemap immediately,
  // then (on 'load') each non-disabled layer's initial source/layer.
  useEffect(() => {
    if (!propertyLayers) return;
    if (mapRef.current) return; // already initialized
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    loadMapLibreModules().then(({ Map }) => {
      // Mount was torn down (or a StrictMode double-invoke's first pass)
      // while the lazy import was in flight — don't create a map nobody
      // will clean up.
      if (cancelled) return;

      const map = new Map({
        container,
        style: {
          version: 8,
          sources: {
            [BASEMAP_SOURCE_ID]: {
              type: "raster",
              tiles: [ESRI_WORLD_IMAGERY_URL],
              tileSize: 256,
              attribution: ESRI_ATTRIBUTION,
            },
          },
          layers: [{ id: BASEMAP_LAYER_ID, type: "raster", source: BASEMAP_SOURCE_ID }],
        },
        center: [0, 0],
        zoom: 1,
      });
      mapRef.current = map;

      map.on("load", () => {
        for (const layer of layersRef.current) {
          // disabled:true → NO MapLibre source/layer added at all. Real
          // branch (this `continue` skips add-source/add-layer entirely),
          // not a cosmetic hide — see docs/components/layer-viewer.md.
          if (layer.disabled) continue;
          addLayerToMap(map, layer);
        }
        // Initial model-layer add — the models-sync effect below only
        // reconciles SUBSEQUENT `models` prop changes (it's guarded on
        // `mapReadyRef.current`, which isn't true until this handler
        // finishes), so the very first add has to happen here, exactly
        // like layersRef's initial add above.
        for (const model of modelsRef.current) {
          map.addLayer(createModelLayer(model));
          addedModelIdsRef.current.add(model.id);
        }
        mapReadyRef.current = true;
        // Re-sync in case a toggle/opacity change (via the imperative handle)
        // landed between map construction and 'load' firing.
        for (const layer of layersRef.current) {
          updateLayerOnMap(map, layer);
        }
      });

      // Auto-fit the view to the first raster/cog layer's real geographic
      // bounds once its tilejson resolves, so the sample ortho (which
      // happens to sit in the high Arctic per the sample-data provenance
      // notes, not at [0,0]) is actually on-screen rather than requiring a
      // manual pan/zoom. Explicitly ignores the basemap's own source id.
      map.on("sourcedata", (e) => {
        if (firstFitDoneRef.current) return;
        if (!e.isSourceLoaded) return;
        if (e.sourceId === BASEMAP_SOURCE_ID) return;
        const source = map.getSource(e.sourceId) as RasterTileSource | undefined;
        const bounds = source?.bounds;
        if (!bounds) return;
        firstFitDoneRef.current = true;
        map.fitBounds(bounds, { padding: 40, duration: 0 });
      });
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        // Symmetric with the addition path above: explicitly remove every
        // active model layer (triggering its own onRemove — see
        // maplibre-model-layer.ts's "Correction 5" GPU-resource cleanup)
        // before tearing down the map itself, same cleanup rigor as the
        // existing mapRef.current.remove() below.
        for (const id of addedModelIdsRef.current) {
          if (mapRef.current.getLayer(id)) mapRef.current.removeLayer(id);
        }
        addedModelIdsRef.current.clear();
        mapRef.current.remove();
        mapRef.current = null;
      }
      mapReadyRef.current = false;
      firstFitDoneRef.current = false;
    };
  }, [propertyLayers]);

  // Add/remove model layers on every `models` prop change, once the map is
  // ready. Diffed by id against addedModelIdsRef so an already-added entry
  // is left untouched — only genuine adds/removes touch the map. Guarded
  // exactly like the "Notify the consumer..." effect above (no map yet, or
  // map not ready yet at mount) — that initial-add case is instead handled
  // directly inside the 'load' handler (modelsRef.current), so this effect
  // only needs to reconcile changes that happen AFTER the map is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const nextIds = new Set((models ?? []).map((model) => model.id));

    for (const id of addedModelIdsRef.current) {
      if (nextIds.has(id)) continue;
      if (map.getLayer(id)) map.removeLayer(id);
      addedModelIdsRef.current.delete(id);
    }

    for (const model of models ?? []) {
      if (addedModelIdsRef.current.has(model.id)) continue;
      map.addLayer(createModelLayer(model));
      addedModelIdsRef.current.add(model.id);
    }
  }, [models]);

  useImperativeHandle(
    ref,
    () => ({
      toggleLayer(id, toggle) {
        setLayers((prev) =>
          prev.map((l) => (l.id === id && !l.disabled ? { ...l, toggle: toggle ?? !l.toggle } : l)),
        );
      },
      setOpacity(id, opacity) {
        const clamped = Math.min(1, Math.max(0, opacity));
        setLayers((prev) => prev.map((l) => (l.id === id && !l.disabled ? { ...l, opacity: clamped } : l)));
      },
      getLayers() {
        return layersRef.current;
      },
    }),
    [],
  );

  const showLoading = !propertyLayers && !loadError;

  return (
    <div className={cx("relative h-full w-full", className)}>
      {/* h-full/w-full, not just `absolute inset-0` — maplibre-gl.css's own
          `.maplibregl-map { position: relative }` rule (added by MapLibre
          to this exact element once it becomes the map container) beats
          Tailwind's `.absolute` utility at equal specificity depending on
          stylesheet order, which silently turns `inset-0` into a no-op and
          collapses this div to 0-height (caught live: the map rendered
          fully black because its canvas had a real width but a 0/300px
          height instead of filling the viewport). Percentage sizing via
          h-full/w-full doesn't depend on which position scheme wins. */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {showLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
          Loading layers…
        </div>
      )}
      {loadError && (
        <div
          role="alert"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/80 text-sm text-white"
        >
          Couldn&apos;t load layers: {loadError}
        </div>
      )}
    </div>
  );
});
