"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
// Type-only imports — erased entirely at compile time (isolatedModules
// requires the explicit `type` keyword for that erasure to be guaranteed).
// Deliberately NOT a value import: see loadMapLibreModules() below for why
// the actual `maplibre-gl` / cog-protocol modules are loaded lazily inside
// an effect instead of at module scope.
import type {
  GeoJSONSource,
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
// Also a real value import, also safe at module scope: @turf/turf's
// distance() is pure geodesic math (haversine over a mean Earth radius) —
// no `Worker`/`window`/WebGL touched at all, unlike the maplibre-gl/
// cog-protocol modules above, so it needs none of loadMapLibreModules()'s
// lazy-import treatment.
import { distance as turfDistance } from "@turf/turf";
// Annotation tool (this epic's AnnotationLayer -- see ANNOTATION_IDLE_MODE's
// comment below and the map-creation effect's "Annotation tool" block for
// where these get wired up). Real value imports, statically -- NOT deferred
// into loadMapLibreModules() the way maplibre-gl/@geomatico/maplibre-cog-protocol
// are, because neither of these two packages has maplibre-gl's
// Worker-at-module-load problem: `terra-draw`'s compiled dist has zero
// `window`/`document` references anywhere (verified directly against
// node_modules/terra-draw/dist/terra-draw.module.js, not just its .d.ts),
// and `terra-draw-maplibre-gl-adapter`'s only `document`/`Image` touches
// (its marker-icon resizeImage helper) live inside a METHOD, not at module
// scope (verified the same way) -- exactly the "safe to import statically"
// bar createModelLayer/turfDistance above already clear.
import {
  TerraDraw,
  TerraDrawFreehandMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRenderMode,
} from "terra-draw";
// terra-draw's own core package deliberately ships no map-library-specific
// adapter (only an abstract base one) -- this is the real, separate
// "buy compute, own the viewer" npm package (peer deps terra-draw ^1.0.0 +
// maplibre-gl >=4, both satisfied by this repo's package.json) that hooks
// terra-draw into an ALREADY-EXISTING `maplibre-gl` `Map` instance (the one
// this component already owns via mapRef, constructed above -- NOT a
// second map of its own): its constructor just takes `{ map }` and calls
// `map.addSource`/`map.addLayer` against it, per its own guide
// (github.com/JamesLMilner/terra-draw/blob/main/guides/3.ADAPTERS.md),
// which is why it's initialized inside the 'load' handler below, same
// timing as every other map.addSource/addLayer call in this file.
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
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

// Exported (not just module-local) so this epic's <CompareSwipe> (see its
// own header comment for why) can build its two comparison panes' basemap
// identically to this main map's own — same Esri imagery, same attribution
// — without duplicating these literals and risking drift if they ever
// change. Pure `export` additions; the values/behavior here are unchanged.
export const ESRI_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ESRI_ATTRIBUTION = "Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const BASEMAP_SOURCE_ID = "esri-world-imagery";
export const BASEMAP_LAYER_ID = "esri-world-imagery-layer";

// Measure tool (this epic's MeasureTool -- see this file's header comment
// for the state-ownership rationale) -- a single GeoJSON source holding
// 0-2 placed Point features plus (once both are placed) one connecting
// LineString feature, backing two MapLibre layers below. One source shared
// by both layers rather than one source per layer: a `circle` layer only
// ever renders Point/MultiPoint geometry from its source and a `line`
// layer only ever renders LineString/MultiLineString geometry, so mixing
// both feature types in one source is safe -- each layer simply ignores
// the geometry type it doesn't draw.
const MEASURE_SOURCE_ID = "layerviewer-measure";
const MEASURE_POINTS_LAYER_ID = "layerviewer-measure-points";
const MEASURE_LINE_LAYER_ID = "layerviewer-measure-line";
/** Accent color for the measure tool's point/line MapLibre paint
 *  properties -- this epic's design token (app/globals.css's
 *  --color-accent, #e8590c). Hardcoded rather than read from CSS because
 *  these are MapLibre GL paint values, not DOM/Tailwind classes -- MapLibre
 *  has no notion of a CSS custom property. Keep in sync with --color-accent
 *  if that token's value ever changes. Mirrors components/Model3D/
 *  Model3D.tsx's identical MEASURE_ACCENT_COLOR constant/rationale, for
 *  cross-component consistency of the measure tool's look. */
const MEASURE_ACCENT_COLOR = "#e8590c";

// Annotation tool (this epic's AnnotationLayer -- see this file's header
// comment for the "why import terra-draw statically" rationale). These are
// terra-draw's OWN built-in mode name strings, not invented here -- verified
// at runtime (each mode class assigns `this.mode = "point"` / "linestring" /
// "polygon" / "freehand" / "render" internally; the .d.ts only types `mode`
// as `string`, so this was checked against the compiled dist output, not
// just the type declarations) -- `draw.setMode(...)` below is called with
// these exact strings.
export type AnnotationMode = "point" | "linestring" | "polygon" | "freehand";
/** terra-draw's own display-only "idle" mode (`TerraDrawRenderMode`) --
 *  placed annotations still render, but no map interaction starts a new
 *  one. Registered as one of this component's terra-draw modes and set
 *  active whenever the mode-switcher toolbar has no drawing mode selected,
 *  so the map ALWAYS has a valid active terra-draw mode (required by
 *  terra-draw) without that mode ever being a drawing one -- mirrors the
 *  measure tool's own `if (!measureModeRef.current) return;` idle gate,
 *  just enforced by terra-draw itself instead of a boolean check here. */
const ANNOTATION_IDLE_MODE = "render";
/** One row per drawing mode in the mode-switcher toolbar, in display order.
 *  Deliberately excludes terra-draw's other built-in modes (circle,
 *  rectangle, sector, sensor, select, marker, ...) -- the story's brief
 *  asks for "point / line / polygon / freehand at minimum" and no more. */
const ANNOTATION_MODE_LABELS: Record<AnnotationMode, string> = {
  point: "Point",
  linestring: "Line",
  polygon: "Polygon",
  freehand: "Freehand",
};
const ANNOTATION_MODE_ORDER: AnnotationMode[] = ["point", "linestring", "polygon", "freehand"];

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

// Exported so this epic's <CompareSwipe> (its own two comparison-pane map
// instances, constructed the same lazy way) can share this SAME
// module-scoped promise cache / addProtocol-once guard instead of running
// its own separate copy — avoids double-registering the "cog" protocol and
// avoids a second, redundant dynamic import of "maplibre-gl" when both
// components are mounted together. No behavior change for existing
// callers (still the same function, same cache).
export function loadMapLibreModules() {
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

  // Style resolution: lib/layer-types.ts's optional `LayerDef.style` field.
  // Absent entirely (the pre-existing case for every showcase page/manifest
  // built before this field existed) falls through to the exact same
  // hardcoded green `#22c55e` fill+line this function always used — zero
  // behavior change for the absent case, by construction (every `??`
  // below bottoms out at the old literal).
  const fillColor = layer.style?.fillColor ?? "#22c55e";
  const lineColor = layer.style?.lineColor ?? "#22c55e";
  const lineOnly = layer.style?.lineOnly ?? false;

  const lineLayer: LayerSpecification = {
    id: mapLineLayerId(layer.id),
    type: "line",
    source: sourceId,
    layout: { visibility },
    paint: { "line-color": lineColor, "line-width": lineOnly ? 1.5 : 2, "line-opacity": layer.opacity },
  };

  if (lineOnly) {
    // Thin accent-colored line, no fill at all — e.g. a contours layer,
    // which shouldn't read as a filled area the way the parcel boundary
    // does.
    return { sourceId, source: { type: "geojson", data: layer.url }, mapLayers: [lineLayer] };
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
        paint: { "fill-color": fillColor, "fill-opacity": layer.opacity * 0.25 },
      },
      lineLayer,
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
 *  (not added yet) or the layer is disabled (never had one added).
 *
 *  Exported so this epic's <CompareSwipe> can keep its two comparison
 *  panes' opacity live-synced with the registry (e.g. a consumer's
 *  <LayerControl> opacity slider) using the exact same paint-property
 *  update path this file's own layers-sync effect uses below — not a
 *  second, parallel implementation of "how to push a LayerDef onto a
 *  MapLibre layer" that could drift from this one. */
export function updateLayerOnMap(map: MapLibreMap, layer: LayerDef) {
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

/** A single measure-tool point, in geographic (not screen-pixel)
 *  coordinates — lng/lat plain fields (not MapLibre's own `LngLat` class
 *  instance) so this stays a plain, serializable value with no MapLibre
 *  dependency, same "bare {x,y,z}, not THREE.Vector3" precedent as
 *  components/Model3D/Model3D.tsx's `Point3`. */
export interface MeasurePoint {
  lng: number;
  lat: number;
}

/** Real great-circle distance between two measure points, in meters —
 *  `@turf/turf`'s `distance()` (haversine over a mean Earth radius), NOT
 *  naive screen-pixel distance, which would be meaningless at different
 *  zoom levels (CBA's own rationale for this tool). Pure and
 *  MapLibre-independent — see LayerViewer.test.tsx for a numeric check
 *  against a known real-world coordinate pair (not part of <LayerViewer>'s
 *  public API; not re-exported from index.ts, same precedent as
 *  buildLayerMapConfig/resolveManifest above). */
export function measureDistanceMeters(a: MeasurePoint, b: MeasurePoint): number {
  return turfDistance([a.lng, a.lat], [b.lng, b.lat], { units: "meters" });
}

/** Formats a meters distance for the measure tool's floating label — meters
 *  to 1 decimal place under 1000m, kilometers to 2 decimals at/above
 *  1000m. Mirrors components/Model3D/Model3D.tsx's `formatDistance()`
 *  smart-unit-formatting precedent (there: raw units vs. real meters given
 *  an optional scale hint; here: meters vs. km, since real-world distance
 *  is always known on a georeferenced map — there's no "no known scale"
 *  case to guard against). */
export function formatMeasureDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters.toFixed(1)} m`;
}

/** Builds the GeoJSON FeatureCollection the measure tool's MapLibre source
 *  (MEASURE_SOURCE_ID) is kept in sync with: one Point feature per placed
 *  point, plus — once both points are placed — one LineString feature
 *  connecting them. Pure and MapLibre-independent — see
 *  LayerViewer.test.tsx for direct unit coverage, same "pull pure logic
 *  out of the browser-API-dependent shell" precedent as
 *  buildLayerMapConfig/resolveManifest above. */
export function buildMeasureFeatureCollection(points: MeasurePoint[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = points.map((point) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [point.lng, point.lat] as [number, number] },
    properties: {},
  }));
  if (points.length === 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: points.map((point) => [point.lng, point.lat] as [number, number]),
      },
      properties: {},
    });
  }
  return { type: "FeatureCollection", features };
}

/** Pure(ish) manifest resolution: given a `PropertyLayers | string` prop
 *  value, returns the resolved `PropertyLayers` — fetching + parsing JSON
 *  if given a URL string, or resolving immediately with the object as-is.
 *  Extracted out of the manifest-resolution effect below so it's
 *  unit-testable directly (mock `fetch`, no component render, no MapLibre
 *  involved at all — see LayerViewer.test.tsx) instead of only reachable
 *  by rendering the full component, which needs a real WebGL context.
 *
 *  When fetched from a URL, every layer's `url` is re-resolved relative to
 *  the manifest's OWN resolved URL (`res.url`, the Fetch API's final
 *  after-redirects URL) via `new URL(layer.url, res.url)`. This is why the
 *  sample manifests (public/layer-viewer-samples/2806-prado/layers.json,
 *  etc.) author their `url` fields as bare filenames ("ortho.tif"), not
 *  root-absolute paths ("/layer-viewer-samples/2806-prado/ortho.tif"): a
 *  root-absolute string always resolves against the ORIGIN regardless of
 *  the base URL's own path (WHATWG URL spec), which breaks the moment this
 *  component — or its manifest — is deployed under any basePath/mount
 *  prefix (e.g. the tools.mdostal.com/framework multi-zone mount). A
 *  filename-relative manifest resolves correctly under ANY mount, with zero
 *  basePath-specific code in this component — this is what actually makes
 *  the "plug-and-play, own the component" contract portable. Object-manifest
 *  callers (no fetch involved) are untouched — their `url` fields are used
 *  exactly as given, since there's no fetched URL to resolve against. */
export async function resolveManifest(manifest: PropertyLayers | string): Promise<PropertyLayers> {
  if (typeof manifest === "string") {
    const res = await fetch(manifest);
    if (!res.ok) throw new Error(`Failed to load layer manifest (${res.status})`);
    const parsed = (await res.json()) as PropertyLayers;
    return {
      ...parsed,
      layers: parsed.layers.map((layer) =>
        layer.url ? { ...layer, url: new URL(layer.url, res.url).href } : layer,
      ),
    };
  }
  return manifest;
}

/** Pure check: is `wrapper` the document's current fullscreen element?
 *  Extracted out of the component so it's unit-testable without a real
 *  Fullscreen API (jsdom doesn't implement `document.fullscreenElement`/
 *  `requestFullscreen`) — same "pull pure logic out of the browser-API-
 *  dependent shell" precedent as `buildLayerMapConfig`/`resolveManifest`
 *  above. */
export function isWrapperFullscreen(wrapper: Element | null, fullscreenElement: Element | null): boolean {
  return wrapper !== null && wrapper === fullscreenElement;
}

export interface LayerViewerHandle {
  /** Set (or toggle, if `toggle` omitted) a layer's visibility. No-op for
   *  unknown or disabled ids. */
  toggleLayer: (id: string, toggle?: boolean) => void;
  /** Set a layer's opacity (clamped 0-1). No-op for unknown or disabled ids. */
  setOpacity: (id: string, opacity: number) => void;
  /** Current live layer list (post manifest-resolution). */
  getLayers: () => LayerDef[];
  /** The underlying MapLibre GL `Map` instance, or `null` before the
   *  manifest has resolved / the map has been constructed. Escape hatch for
   *  advanced consumers AND for numeric verification in tests (e.g.
   *  land-overlay-test-suite's `map.project()`/`map.setPitch()`/
   *  `map.setBearing()` placement checks) that need direct access to
   *  MapLibre's own camera math — deliberately not wrapped/proxied here,
   *  since re-exposing a subset of MapLibre's own API on this handle would
   *  just be a worse, harder-to-maintain copy of the same surface. */
  getMap: () => MapLibreMap | null;
  /** Enter fullscreen (targeting this component's OUTER wrapper — the
   *  element that contains the map container AND the loading/error overlay
   *  siblings, not just the map container itself) if not currently
   *  fullscreen; exit fullscreen if it is. Same "handle method, no forced
   *  internal chrome" composition pattern as toggleLayer/setOpacity above —
   *  see this file's header comment for why <LayerViewer> deliberately
   *  exposes control via ref rather than rendering its own button (a map
   *  surface and its controls are independently-placeable regions a
   *  consumer may want to lay out differently). No explicit
   *  `map.resize()` call is needed anywhere in this path: maplibre-gl's
   *  `Map` constructor wires up a real `ResizeObserver` on `containerRef`
   *  (`trackResize` defaults `true`), which calls `resize()` automatically
   *  the moment the Fullscreen-API-driven container resize happens. A
   *  no-op if the browser has no Fullscreen API, if a fullscreen request
   *  is rejected (e.g. not triggered by a user gesture), or before the
   *  wrapper has mounted. */
  toggleFullscreen: () => void;
  /** Current fullscreen state (whether this component's outer wrapper is
   *  the document's fullscreen element). Read from a ref (same "avoid
   *  stale closures" reasoning as getLayers() above), kept in sync by the
   *  wrapper's own `fullscreenchange` listener — see the effect below. */
  isFullscreen: () => boolean;
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
  /** Annotation tool (this epic's AnnotationLayer): fired with the CURRENT
   *  full list of placed annotation features (points/lines/polygons/
   *  freehand shapes) every time it changes -- an annotation placed,
   *  edited, or deleted via the legend panel's per-row Delete button. This
   *  repo has no backend anywhere (CLAUDE.md), so <LayerViewer> owns no
   *  persistence of its own -- this is the escape hatch a consuming app
   *  uses to own that itself (localStorage, a database, wherever), same
   *  "the viewer doesn't own state it shouldn't" pattern as
   *  `onLayersChange` above. Features are plain GeoJSON (terra-draw's own
   *  `getSnapshot()` output), not a terra-draw-specific shape, so a
   *  consumer never needs to depend on terra-draw's types directly. */
  onAnnotationsChange?: (features: GeoJSON.Feature[]) => void;
  /** Fired whenever fullscreen state changes (user-initiated via the
   *  handle's `toggleFullscreen()`, OR externally — e.g. the browser's own
   *  "Esc to exit fullscreen" affordance, which bypasses the handle
   *  entirely). Mirrors `onLayersChange`'s "state notification via
   *  callback, control via handle" composition. */
  onFullscreenChange?: (isFullscreen: boolean) => void;
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
  { manifest, models, onLayersChange, onLoadError, onFullscreenChange, onAnnotationsChange, className },
  ref,
) {
  const [propertyLayers, setPropertyLayers] = useState<PropertyLayers | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerDef[]>([]);

  // The OUTER wrapper — contains the map container (containerRef, below)
  // AND its showLoading/loadError overlay siblings (see the returned JSX).
  // Fullscreen targets THIS node, never containerRef: requestFullscreen()
  // promotes only its target (+ descendants) into the browser's fullscreen
  // top-layer, and the overlays are containerRef's SIBLINGS, not its
  // descendants — targeting containerRef would silently drop them out of
  // the fullscreen view while active.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
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

  // Measure tool (this epic's MeasureTool — see MEASURE_SOURCE_ID's own
  // comment for the shared-source rationale). `measurePoints` is the
  // source of truth (0-2 points); `measureMode` gates whether a map click
  // places a new point at all — the map's normal pan/zoom/click behavior
  // is otherwise completely unaffected. Mirrors components/Model3D/
  // Model3D.tsx's measureMode/points state and "a third click clears the
  // old measurement and starts fresh at the new point" behavior, for
  // cross-component UX consistency.
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<MeasurePoint[]>([]);
  // Screen-pixel position of the floating distance label
  // (`map.project()`'d from the two points' midpoint), recomputed on every
  // 'move' (pan/zoom/rotate) so the label tracks the map instead of
  // drifting. Deliberately NOT a `maplibregl.Popup` — a Popup's own default
  // chrome (white background, tip arrow, close button) would have to be
  // fought/overridden to use this epic's design tokens (bg-surface/
  // border-border/text-accent, matching <LayerControl>'s panel look)
  // instead of just applying them directly to a plain positioned div, the
  // same way Model3D's drei-<Html>-based label does.
  const [measureLabelPos, setMeasureLabelPos] = useState<{ x: number; y: number } | null>(null);

  // Read by the map's 'click' listener (registered once, at map
  // construction, see the map-creation effect below) without needing
  // `measureMode` in that effect's dependency array — same "avoid stale
  // closures via a ref" pattern as layersRef/modelsRef above.
  const measureModeRef = useRef(measureMode);
  useEffect(() => {
    measureModeRef.current = measureMode;
  }, [measureMode]);
  // Read by updateMeasureLabelPosition (below) so that callback can stay a
  // stable identity (empty deps) while still always reading the CURRENT
  // points — same pattern as layersRef.
  const measurePointsRef = useRef<MeasurePoint[]>([]);
  useEffect(() => {
    measurePointsRef.current = measurePoints;
  }, [measurePoints]);

  // Recomputes measureLabelPos from the CURRENT measurePoints (via the ref
  // above). Called both from the map's 'move' listener (registered once at
  // map construction, so it needs a stable function identity) and directly
  // whenever measurePoints itself changes (the sync effect below) — panning
  // isn't the only thing that should reposition/hide the label; placing or
  // clearing points must too.
  const updateMeasureLabelPosition = useCallback(() => {
    const map = mapRef.current;
    const points = measurePointsRef.current;
    if (!map || points.length !== 2) {
      setMeasureLabelPos(null);
      return;
    }
    const midpoint = { lng: (points[0].lng + points[1].lng) / 2, lat: (points[0].lat + points[1].lat) / 2 };
    const projected = map.project([midpoint.lng, midpoint.lat]);
    setMeasureLabelPos({ x: projected.x, y: projected.y });
  }, []);

  // Annotation tool (this epic's AnnotationLayer -- see this file's header
  // comment + ANNOTATION_IDLE_MODE's comment above for the full rationale).
  // `terraDrawRef` holds the live TerraDraw instance, created once inside
  // the map's 'load' handler below (never re-created for the life of this
  // map instance). `annotationMode` is which drawing mode the mode-switcher
  // toolbar currently has active -- `null` means terra-draw is sitting in
  // its ANNOTATION_IDLE_MODE, same "off" meaning as the measure tool's
  // `measureMode === false`. `annotations` is the live list of placed
  // features, kept in sync from terra-draw's own "change" event (its own
  // store is the source of truth -- this state is a read-only mirror of it
  // for the legend panel to render + for the onAnnotationsChange callback
  // below, not a second source of truth terra-draw has to be told about).
  const terraDrawRef = useRef<TerraDraw | null>(null);
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode | null>(null);
  const [annotations, setAnnotations] = useState<GeoJSON.Feature[]>([]);

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
  const onFullscreenChangeRef = useRef(onFullscreenChange);
  useEffect(() => {
    onFullscreenChangeRef.current = onFullscreenChange;
  }, [onFullscreenChange]);
  const onAnnotationsChangeRef = useRef(onAnnotationsChange);
  useEffect(() => {
    onAnnotationsChangeRef.current = onAnnotationsChange;
  }, [onAnnotationsChange]);

  // Mode-switcher toolbar click handler: clicking the ALREADY-active mode's
  // button toggles annotation drawing off (back to ANNOTATION_IDLE_MODE) --
  // same "click active to turn off" toggle affordance as the Measure
  // button above -- clicking any other mode switches straight to it
  // (terra-draw's own setMode() handles stopping whichever mode was
  // previously active). No-op before terra-draw has been constructed
  // (map not ready yet).
  const handleAnnotationModeClick = useCallback(
    (mode: AnnotationMode) => {
      const draw = terraDrawRef.current;
      if (!draw) return;
      if (annotationMode === mode) {
        draw.setMode(ANNOTATION_IDLE_MODE);
        setAnnotationMode(null);
      } else {
        draw.setMode(mode);
        setAnnotationMode(mode);
      }
    },
    [annotationMode],
  );

  // Legend panel's per-row Delete button. terra-draw's own "change" event
  // (registered where the TerraDraw instance is constructed below) is what
  // actually updates `annotations` state + fires onAnnotationsChange --
  // this just tells terra-draw's store to remove the feature, the same
  // "terra-draw's store is the source of truth" precedent as the mode
  // click handler above.
  const handleDeleteAnnotation = useCallback((id: GeoJSON.Feature["id"]) => {
    if (id === undefined) return;
    terraDrawRef.current?.removeFeatures([id]);
  }, []);

  // Read by the handle's isFullscreen() — a ref (not just the `document`
  // global directly) so it stays consistent with getLayers()'s "read
  // latest value via ref, not a stale render-time closure" precedent, and
  // so isFullscreen() has a well-defined answer even outside a browser
  // fullscreen-capable environment.
  const isFullscreenRef = useRef(false);

  // Keep isFullscreenRef + fire onFullscreenChange whenever fullscreen
  // state changes for ANY reason — not just the handle's toggleFullscreen()
  // below, but also the browser's own "Esc exits fullscreen" affordance,
  // which never calls back into this component's code at all. Listening
  // on `document` (not the wrapper element) is deliberate: `fullscreenchange`
  // is the correct event for this regardless of which element is/was
  // fullscreen, and it's the only reliable way to observe an Esc-triggered
  // exit.
  useEffect(() => {
    function handleFullscreenChange() {
      const active = isWrapperFullscreen(wrapperRef.current, document.fullscreenElement);
      isFullscreenRef.current = active;
      onFullscreenChangeRef.current?.(active);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

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

  // Sync the measure tool's placed points onto the map: rebuild the
  // MEASURE_SOURCE_ID GeoJSON source's data (buildMeasureFeatureCollection
  // above) and reposition the floating distance label. Guarded on
  // mapReadyRef same as the layers-sync effect above — no-op before the
  // map's 'load' has fired; the 'load' handler below re-syncs from
  // measurePointsRef.current for exactly the same "a click landed before
  // load fired" reason layersRef gets a re-sync there.
  useEffect(() => {
    const map = mapRef.current;
    if (map && mapReadyRef.current) {
      const source = map.getSource(MEASURE_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(buildMeasureFeatureCollection(measurePoints));
    }
    updateMeasureLabelPosition();
  }, [measurePoints, updateMeasureLabelPosition]);

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
        // Lets a consumer (or a test) read back the rendered frame via
        // canvas.toDataURL()/toBlob() after the render loop has already
        // cleared the default framebuffer — without this, MapLibre's canvas
        // reads back blank the instant nothing is mid-frame, which is the
        // normal state any time JS runs (confirmed live: this exact gap is
        // why the land-overlay epic's Playwright verification couldn't
        // capture a real screenshot of the draped 3D model before this).
        preserveDrawingBuffer: true,
      });
      mapRef.current = map;

      // Measure tool: registered here (not inside 'load') so a genuine
      // click landing between map construction and 'load' firing isn't
      // lost — the 'load' handler below re-syncs the map's measure source
      // from measurePointsRef.current for exactly that reason, same
      // precedent as layersRef's own re-sync there. Placement is gated on
      // measureModeRef.current (not a stale `measureMode` closure) so
      // toggling Measure on/off never needs this listener re-registered.
      map.on("click", (e) => {
        if (!measureModeRef.current) return;
        const { lng, lat } = e.lngLat;
        setMeasurePoints((prev) => (prev.length >= 2 ? [{ lng, lat }] : [...prev, { lng, lat }]));
      });
      map.on("move", updateMeasureLabelPosition);

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
        // Measure tool's own GeoJSON source + point/line layers — added
        // once here (not lazily on first click) so MEASURE_SOURCE_ID
        // always exists for the sync effect above to setData() against.
        // Added AFTER the property/model layers so measure markers/line
        // render on top of the imagery/models a user is actively
        // measuring against.
        map.addSource(MEASURE_SOURCE_ID, {
          type: "geojson",
          data: buildMeasureFeatureCollection(measurePointsRef.current),
        });
        map.addLayer({
          id: MEASURE_LINE_LAYER_ID,
          type: "line",
          source: MEASURE_SOURCE_ID,
          paint: { "line-color": MEASURE_ACCENT_COLOR, "line-width": 2 },
        });
        map.addLayer({
          id: MEASURE_POINTS_LAYER_ID,
          type: "circle",
          source: MEASURE_SOURCE_ID,
          paint: {
            "circle-radius": 5,
            "circle-color": MEASURE_ACCENT_COLOR,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Annotation tool: TerraDraw attached directly to THIS already-
        // constructed `map` instance via TerraDrawMapLibreGLAdapter (see
        // this file's header comment) -- not a second map of its own. The
        // adapter's own register() call (triggered by draw.start() below)
        // adds three more GeoJSON sources/layers of ITS own (default
        // "td-point"/"td-linestring"/"td-polygon" prefixed ids) on top of
        // this same map, after the property/model/measure layers above so
        // placed annotations render on top of the imagery being annotated
        // -- same ordering rationale as the measure tool's own layers.
        // Constructed here (inside 'load', not at map construction time)
        // per the adapter's own guide, which calls out that its register()
        // needs the style to have already loaded.
        const draw = new TerraDraw({
          adapter: new TerraDrawMapLibreGLAdapter({ map }),
          modes: [
            new TerraDrawPointMode(),
            new TerraDrawLineStringMode(),
            new TerraDrawPolygonMode(),
            new TerraDrawFreehandMode(),
            // Unlike the drawing modes above, TerraDrawRenderMode's
            // constructor requires a `styles` option (even if empty) —
            // an empty object keeps its defaults, which is all this idle
            // mode needs (it never lets a user draw, so its own styling
            // never actually gets used for a NEW feature — only for
            // re-rendering whatever the drawing modes already placed).
            new TerraDrawRenderMode({ styles: {} }),
          ],
        });
        draw.start();
        // Idle by default -- see ANNOTATION_IDLE_MODE's own comment above
        // for why a plain map click must not start drawing until a
        // consumer picks a mode from the toolbar.
        draw.setMode(ANNOTATION_IDLE_MODE);
        // terra-draw's own store is the single source of truth for placed
        // annotations (see handleAnnotationModeClick/handleDeleteAnnotation
        // above) -- every create/update/delete/styling change re-reads the
        // full current snapshot rather than trying to diff the event's own
        // ids/type payload, which keeps this in sync regardless of WHICH
        // terra-draw internal codepath caused the change (a toolbar-driven
        // draw, a legend-panel delete, or any future programmatic
        // addFeatures/removeFeatures call).
        draw.on("change", () => {
          const snapshot = draw.getSnapshot() as GeoJSON.Feature[];
          setAnnotations(snapshot);
          onAnnotationsChangeRef.current?.(snapshot);
        });
        terraDrawRef.current = draw;

        mapReadyRef.current = true;
        // Re-sync in case a toggle/opacity change (via the imperative handle)
        // landed between map construction and 'load' firing.
        for (const layer of layersRef.current) {
          updateLayerOnMap(map, layer);
        }
        // Same re-sync for the measure tool: a click landing between map
        // construction and 'load' firing already updated React state (and
        // therefore measurePointsRef.current), but the source didn't exist
        // yet for the sync effect above to write into.
        const measureSource = map.getSource(MEASURE_SOURCE_ID) as GeoJSONSource | undefined;
        measureSource?.setData(buildMeasureFeatureCollection(measurePointsRef.current));
        updateMeasureLabelPosition();
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
        // Annotation tool: stop() (not just dropping the ref) triggers the
        // adapter's own unregister(), which removes ITS "td-*" sources/
        // layers from this map — same "don't just drop the reference, tear
        // down what was actually added to the map" rigor as the model
        // layers above. Must run BEFORE mapRef.current.remove() below,
        // while the map instance stop()/unregister() writes into is still
        // alive.
        if (terraDrawRef.current) {
          terraDrawRef.current.stop();
          terraDrawRef.current = null;
        }
        mapRef.current.remove();
        mapRef.current = null;
      }
      mapReadyRef.current = false;
      firstFitDoneRef.current = false;
    };
  }, [propertyLayers, updateMeasureLabelPosition]);

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
      getMap() {
        return mapRef.current;
      },
      toggleFullscreen() {
        // No manual map.resize() anywhere in this path, deliberately: see
        // this handle method's own doc comment above for why maplibre-gl's
        // ResizeObserver already handles it.
        if (typeof document === "undefined") return;
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {
            // Nothing meaningful to recover into — exit failing just
            // leaves fullscreen state as-is, no need to disrupt the
            // consumer with an unhandled rejection.
          });
          return;
        }
        // requestFullscreen() can reject even in a secure context (e.g. no
        // user-gesture, or a Permissions-Policy restriction) — swallow
        // rather than let a normal click produce an unhandled promise
        // rejection (same defensive shape the copy-to-clipboard button
        // uses for writeText()'s promise).
        wrapperRef.current?.requestFullscreen().catch(() => {});
      },
      isFullscreen() {
        return isFullscreenRef.current;
      },
    }),
    [],
  );

  const showLoading = !propertyLayers && !loadError;

  return (
    <div ref={wrapperRef} className={cx("relative h-full w-full", className)}>
      {/* wrapperRef (this div), not containerRef below, is the fullscreen
          target — see LayerViewerHandle.toggleFullscreen's doc comment and
          isWrapperFullscreen above. This div is the real outer wrapper: it
          contains containerRef AND the showLoading/loadError overlay
          siblings below, so fullscreen-ing it keeps all three inside the
          browser's fullscreen top-layer together. */}
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

      {/* Measure tool floating distance label — screen-pixel positioned via
          measureLabelPos (see that state's own comment for why this is a
          plain div, not a maplibregl.Popup). pointer-events-none so it
          never intercepts map clicks — a third click landing under the
          label should still reset the measurement, not be swallowed by it.
          Styled to match Model3D's own floating measure label exactly
          (rounded-md border border-border bg-surface/90 ... text-accent
          shadow-lg) for cross-component consistency. */}
      {measureLabelPos && measurePoints.length === 2 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-surface/90 px-2 py-1 text-xs font-medium text-accent shadow-lg"
          style={{ left: measureLabelPos.x, top: measureLabelPos.y }}
        >
          {formatMeasureDistance(measureDistanceMeters(measurePoints[0], measurePoints[1]))}
        </div>
      )}

      {/* Measure tool panel — toggle + legend + Clear action, styled with
          the same design tokens <LayerControl> uses for its own panel
          (bg-surface/90, border-border, rounded-xl, backdrop-blur — see
          LayerControl.tsx). Positioned bottom-left, deliberately not
          top-right: this repo's own showcase page places a
          consumer-rendered <LayerControl> + Fullscreen button top-right
          (app/(showcase)/components/layer-viewer/page.tsx) and this panel
          is <LayerViewer>'s own internal chrome, not something a consumer
          arranges — bottom-left avoids colliding with that common layout
          without requiring every consumer to coordinate placement. The
          toggle/legend/Clear interaction pattern itself mirrors
          components/Model3D/Model3D.tsx's own measure-tool panel exactly
          (see that file's header comment) for cross-component UX
          consistency. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute bottom-3 left-3 flex w-56 flex-col gap-2 rounded-xl border border-border bg-surface/90 p-3 text-xs text-foreground shadow-lg backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Measure</span>
            <button
              type="button"
              onClick={() => setMeasureMode((prev) => !prev)}
              aria-pressed={measureMode}
              className={cx(
                "rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                measureMode
                  ? "border-accent bg-accent text-white"
                  : "border-border text-foreground hover:border-accent hover:text-accent",
              )}
            >
              {measureMode ? "Measure: On" : "Measure"}
            </button>
          </div>
          <ul className="flex flex-col gap-1 text-muted">
            {measureMode ? (
              <>
                <li className="text-accent">Click two points to measure</li>
                <li>
                  <button
                    type="button"
                    onClick={() => setMeasurePoints([])}
                    disabled={measurePoints.length === 0}
                    className="text-foreground underline decoration-dotted underline-offset-2 disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
                  >
                    Clear measurement
                  </button>
                </li>
              </>
            ) : (
              <li>Toggle Measure to place points</li>
            )}
          </ul>
        </div>
      </div>

      {/* Annotation tool panel — mode-switcher toolbar (point/line/polygon/
          freehand) + a legend/list panel of placed annotations with a
          per-row delete button, styled with the exact same design tokens
          as the Measure panel above / <LayerControl>'s own panel
          (bg-surface/90, border-border, rounded-xl, backdrop-blur).
          Positioned top-left, deliberately distinct from both the Measure
          panel's bottom-left slot and the right-hand
          Fullscreen-button+<LayerControl> column a consumer typically
          renders (see this repo's own showcase page) — same "this is
          <LayerViewer>'s own internal chrome, avoid colliding with common
          consumer layouts" reasoning as the Measure panel's own placement
          comment above. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute left-3 top-3 flex max-h-[60vh] w-56 min-h-0 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-surface/90 p-3 text-xs text-foreground shadow-lg backdrop-blur">
          <span className="font-medium">Annotate</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Annotation drawing mode">
            {ANNOTATION_MODE_ORDER.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleAnnotationModeClick(mode)}
                aria-pressed={annotationMode === mode}
                className={cx(
                  "rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                  annotationMode === mode
                    ? "border-accent bg-accent text-white"
                    : "border-border text-foreground hover:border-accent hover:text-accent",
                )}
              >
                {ANNOTATION_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
          {annotationMode && <span className="text-accent">Click the map to draw</span>}
          {annotations.length === 0 ? (
            <span className="text-muted">No annotations yet</span>
          ) : (
            <ul aria-label="Placed annotations" className="flex flex-col gap-1 text-muted">
              {annotations.map((feature) => (
                <li key={String(feature.id)} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate capitalize text-foreground">
                    {feature.geometry.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteAnnotation(feature.id)}
                    aria-label={`Delete ${feature.geometry.type} annotation`}
                    className="shrink-0 text-foreground underline decoration-dotted underline-offset-2 hover:text-accent"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

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
