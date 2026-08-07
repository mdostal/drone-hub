// Typed registry for <LayerViewer> — CBA calls this "the owned IP."
// A property's imagery/data is a flat LIST of toggleable layers draped over
// a satellite base map. The base map itself is NOT a registry entry — it's
// the map's base, handled separately in <LayerViewer>, not toggleable via
// LayerControl.

/**
 * A single toggleable, opacity-controlled overlay (ortho / thermal /
 * hillshade / heightmap / contours / parcel boundary / etc).
 *
 * @example CBA's literal thermal-stub — a disabled slot with no backing
 * data yet (Mini 5 Pro has no thermal sensor). `url` is `null`, not
 * omitted, since it's required-but-nullable.
 * ```ts
 * const thermalStub: LayerDef = {
 *   id: "thermal",
 *   type: "raster",
 *   url: null,
 *   opacity: 1,
 *   toggle: false,
 *   disabled: true,
 *   legend: "ironbow",
 * };
 * ```
 */
export interface LayerDef {
  /** stable id, e.g. "ortho" | "thermal" | "hillshade" | "boundary" */
  id: string;
  /** raster imagery (ortho/thermal/hillshade/heightmap) or vector geojson
   *  (parcel boundary, annotations). Intentionally NOT split into
   *  'raster-cog'/'raster-tiles' — see `format` for that distinction. */
  type: "raster" | "geojson";
  /** URL of the layer's data (COG/GeoTIFF, XYZ tile template, or GeoJSON).
   *  null → no data exists yet for this slot. REQUIRED to be null for
   *  `disabled: true` stubs (e.g. the thermal slot before a radiometric
   *  sensor is acquired) — there is nothing to fetch. */
  url: string | null;
  /** 0–1 opacity the layer renders at when toggled on. */
  opacity: number;
  /** whether the layer is currently shown. */
  toggle: boolean;
  /** true → this slot is a stub with no backing data (e.g. thermal before
   *  a radiometric sensor exists). LayerControl should render it disabled
   *  rather than omit it, so the "killer feature" (layer toggle) previews
   *  the full property-intelligence surface even before every layer ships.
   *  Omitted/false → the layer is live. */
  disabled?: boolean;
  /** human-readable legend/colormap label, e.g. "ironbow" for a thermal
   *  palette. Omitted → no legend swatch is shown. */
  legend?: string;
  /** raster source kind, distinguishing which MapLibre source builder the
   *  renderer should use for `type: 'raster'` layers:
   *  - 'cog'  → single georeferenced COG/GeoTIFF (e.g. via
   *             @geomatico/maplibre-cog-protocol).
   *  - 'xyz'  → pre-tiled XYZ/PMTiles raster tile template.
   *  Ignored for `type: 'geojson'`. Conceptually defaults to 'cog' when
   *  omitted — that default is APPLIED by the renderer (a later story),
   *  not by this types file. */
  format?: "cog" | "xyz";
}

/** A full layer manifest for one property. Ships as layers.json.
 *  No `basemap` field — the satellite base map is the viewer's base,
 *  not a toggleable registry entry. */
export interface PropertyLayers {
  slug: string; // "2806-prado"
  title: string; // "2806 Prado"
  layers: LayerDef[];
}
