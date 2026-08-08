// Minimal type for the minecraft-content-engine epic's flight-log
// table/panel (part of the gated content-engine page's per-slug flight-docs
// section). See .pHive/epics/minecraft-content-engine/docs/
// design-discussion.md point 6 for the full rationale — short version: an
// earlier draft of this epic designed this type with fields anticipated for
// the FUTURE telemetry-driven-video-overlay epic's camera-pose computation
// (gimbal pitch/yaw/roll), and a grill correction flagged that as
// speculative design, inconsistent with this project's own established
// precedent (`GeoAnchoredModel` in lib/geo-model-types.ts was deliberately
// kept separate from `<Model3D>`'s `ModelDef` rather than pre-unified for
// land-overlay's then-future needs). Fix: this type is scoped to exactly
// what THIS epic's flight-log panel displays — time, position, altitude.
// The telemetry-video-overlay epic will define whatever type IT actually
// needs against its own real requirements when it's actually planned. Do
// NOT add gimbal/orientation/camera-pose fields here, even though they
// might seem useful "later" — that's precisely the speculation this type
// must avoid.

/**
 * A single row of drone flight telemetry, as displayed in the
 * content-engine page's flight-log table/panel (time, position, altitude).
 *
 * @example
 * ```ts
 * const row: FlightLogEntry = {
 *   timestampMs: 1000,
 *   lat: 33.4484,
 *   lon: -112.074,
 *   altitudeMeters: 12.5,
 * };
 * ```
 */
export interface FlightLogEntry {
  /** milliseconds since flight start (or epoch — display-only, no timezone
   *  handling required by this type). */
  timestampMs: number;
  /** latitude, degrees. */
  lat: number;
  /** longitude, degrees. */
  lon: number;
  /** altitude above ground/takeoff point, in meters. */
  altitudeMeters: number;
}
