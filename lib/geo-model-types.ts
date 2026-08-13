// Typed schema for the land-overlay epic's MapLibre custom-layer 3D model
// engine (lib/maplibre-model-layer.ts). See
// .pHive/epics/land-overlay/docs/design-discussion.md for the full
// rationale — short version: this is deliberately a DIFFERENT shape from
// components/Model3D/Model3D.tsx's `ModelDef {id, url, title}`, which is
// scene-space (a single mesh placed at the origin of its own <Canvas>, no
// notion of "where on Earth"). `GeoAnchoredModel` is geo-space: a model
// draped onto <LayerViewer>'s georeferenced map at a real lat/lon, the way
// every other layer in lib/layer-types.ts is real-world-anchored. Model3D's
// epic explicitly deferred inventing this shape until an epic that actually
// needed geo-anchoring existed (guessing it upfront risked locking in the
// wrong fields) — this is that epic. Do not import/extend/alias `ModelDef`
// here; the two types are intentionally unrelated.

/**
 * A single glTF/glb model anchored at a real-world position, rendered via
 * `createModelLayer()` (lib/maplibre-model-layer.ts) as a MapLibre
 * `CustomLayerInterface` composited onto `<LayerViewer>`'s map.
 *
 * @example the epic's sample placement — the `<Model3D>` duck, reused
 * as-is, anchored inside the existing sample parcel's real (if arbitrary —
 * a rio-tiler test extent, not survey data) rio-tiler test extent:
 * ```ts
 * const sampleDuck: GeoAnchoredModel = {
 *   id: "duck",
 *   url: "/model3d-samples/duck/model.glb",
 *   title: "Sample Duck",
 *   lat: 73.4707,
 *   lon: -73.0,
 *   scale: 5,
 * };
 * ```
 */
export interface GeoAnchoredModel {
  /** stable id — also used as the MapLibre custom layer's `id`. */
  id: string;
  /** URL of the glTF/glb asset (fetched by three.js's GLTFLoader). */
  url: string;
  /** human-readable label (attribution/UI use — not rendered by the layer
   *  engine itself, which is a headless MapLibre layer with no DOM). */
  title: string;
  /** anchor latitude, degrees. */
  lat: number;
  /** anchor longitude, degrees. */
  lon: number;
  /** anchor altitude in meters above the WGS84 ellipsoid/ground plane.
   *  Omitted → 0 (ground level). Distinct from `scale`: this positions the
   *  model's origin, it doesn't resize the model. */
  altitudeMeters?: number;
  /** yaw, in degrees, applied about the vertical (up) axis after the
   *  fixed glTF-Y-up → Mercator-Z-up correction `createModelLayer` always
   *  applies. Omitted → 0 (model's glTF-authored orientation, unrotated). */
  rotationDegrees?: number;
  /** uniform scale multiplier applied on top of the meters→Mercator-units
   *  conversion `createModelLayer` computes from the anchor's latitude
   *  (`MercatorCoordinate.meterInMercatorCoordinateUnits()`) — i.e. this is
   *  "how many real-world meters should the glTF's own unit of length
   *  represent," not a raw Mercator-space scale factor. Omitted → 1 (glTF
   *  is assumed to already be authored in meters). */
  scale?: number;
  /** Which of the glTF's own local axes is "up" in the source asset.
   *  Omitted → "y", the glTF-spec default (`buildModelMatrix` applies its
   *  fixed 90° X-axis correction, exactly as before this field existed —
   *  zero behavior change for every model authored before this field
   *  existed). "z" skips that correction entirely instead: real
   *  photogrammetry meshes out of OpenDroneMap (confirmed against the real
   *  2806 Prado reconstruction — its accessor bounds put a ~89x86m
   *  footprint on X/Y and a 133-157 range on Z, matching true ASL
   *  elevation in meters for that site almost exactly) come out Z-up, with
   *  Z left as absolute real-world elevation rather than glTF's
   *  recentered/rotated Y-up convention — applying the Y-up correction to
   *  one of these would rotate the terrain onto its side. */
  upAxis?: "y" | "z";
}
