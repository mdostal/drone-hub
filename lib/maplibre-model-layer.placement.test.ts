// Real-browser, real-WebGL numeric verification for lib/maplibre-model-layer.ts
// — land-overlay-test-suite. Run via `npm run test:e2e` (playwright.config.ts),
// NOT `npm test` (vitest/jsdom has no WebGL — see maplibre-model-layer.ts's
// own "TESTABILITY MAP" header comment and maplibre-model-layer.test.ts's
// header comment for exactly what those unit tests do/don't prove; this file
// is the "Playwright's job" they defer to).
//
// This story exists specifically because the epic's design discussion
// (.pHive/epics/land-overlay/docs/design-discussion.md, "verification"
// section) was explicit, after adversarial review, that qualitative "looks
// roughly right" checking is NOT sufficient for this epic's hardest
// rendering work. Every assertion below is a real pixel-space number read
// back from an actual rendered frame, compared against either MapLibre's
// own `map.project()` or a documented, empirically-derived reference value
// — never a screenshot diff or a "no console error" check.
//
// MECHANISM — reaching the live MapLibre instance:
// `page.evaluate` runs in the browser but has no way to reach into a
// React ref from outside the component tree, and <LayerViewer> doesn't
// otherwise expose its internal `Map` instance. Both showcase pages this
// file drives (app/(showcase)/components/land-overlay/page.tsx and
// app/(showcase)/components/layer-viewer/page.tsx) now stash their
// `LayerViewerHandle` ref onto `window.__layerViewerHandle` in a
// `NODE_ENV !== "production"` — gated effect (see those files' own header
// comments) specifically for this — `LayerViewerHandle` itself grew a new
// `getMap()` accessor (components/LayerViewer/LayerViewer.tsx) for exactly
// this purpose. `createModelLayer`'s `ModelLayer` interface also grew
// `isReady()` (lib/maplibre-model-layer.ts) so this file can wait
// deterministically for "the model has actually rendered a frame" instead
// of guessing with a fixed timeout.
//
// MECHANISM — reading back actual rendered pixels:
// `<canvas>.toDataURL()`/`getImageData()` on a WebGL canvas only returns
// real content if either the context was created with
// `preserveDrawingBuffer: true` (<LayerViewer>'s isn't — matching
// MapLibre's own default) OR the readback happens SYNCHRONOUSLY inside the
// map's own `"render"` event callback, before control returns to the
// browser's event loop/compositor. Verified live (an attempt to read back
// from a `setTimeout`/microtask after `"render"` reliably produced
// all-zero/transparent pixels; reading back from inside the `"render"`
// callback itself reliably produced the real frame) — every capture below
// uses `map.once("render", () => { <synchronous getImageData read> })` +
// `map.triggerRepaint()`.
//
// DUCK-COLORED-PIXEL MASK: `R - B > 100` on the captured RGBA buffer.
// UPDATED by layerviewer-sample-dataset-overhaul (threshold raised from the
// original 60): the new sample ortho is REAL, colorful drone photography
// (trees/road/graded dirt — see docs/components/layer-viewer.md's "Sample
// data provenance"), unlike the old near-blank Arctic/placeholder
// background the original 60 threshold was calibrated against. Live-sampled
// directly against `CLEAN_REFERENCE_URL` (the SAME ortho, zero duck models)
// at the duck's real anchor coordinates: the ortho's dirt/gravel-field
// pixels cluster at R-B in roughly [60, 70] — high enough to false-positive
// past the OLD 60 threshold (confirmed live: 253 stray matches with zero
// duck present), but nowhere near the duck's own body/beak cluster, which
// live-sampled at R-B in roughly [120, 220]. 100 sits cleanly between the
// two with real margin on both sides (confirmed live: zero false-positive
// pixels anywhere in the clean-reference frame at this threshold).
import { expect, test, type Page } from "@playwright/test";

const LAND_OVERLAY_URL = "/components/land-overlay";
// A page that mounts the SAME manifest/ortho layer but NEVER passes a
// `models` prop — i.e. the model-layer custom-layer code path never runs
// on this page's map at all. Used as the GL-state-pollution test's "the
// model layer never touched this GL context" ground truth (see that
// test's own comment for why a genuinely separate, model-free page is
// used instead of an early-as-possible capture on the SAME page).
const CLEAN_REFERENCE_URL = "/components/layer-viewer";

// Mirrors app/(showcase)/components/land-overlay/page.tsx's SAMPLE_MODELS
// duck anchor exactly (the sample parcel's centroid — see that file for
// full provenance). Updated AGAIN by the real georeferenced-fix story: the
// sample ortho/hillshade/parcel/contours were replaced with the operator's
// own real, rights-cleared 2806 Prado St photogrammetry (~30.262°N/
// -97.708°W, Austin TX), so the duck anchor moved to that new parcel's
// centroid. Zoom/golden-centroid/mask-threshold below were all re-verified
// live against the new ortho (see each constant's own comment) — this is a
// real re-calibration, not a blind coordinate swap.
const DUCK_LAT = 30.2618978800391;
const DUCK_LON = -97.7081778061722;
// Live-tuned against the real showcase page (RE-TUNED by
// layerviewer-sample-dataset-overhaul for the new, much smaller parcel —
// see DUCK_LAT/DUCK_LON's own comment): at this zoom the duck renders as a
// clearly-visible, non-degenerate silhouette comfortably inside the canvas.
// zoom 18 (the OLD value) was tried first and found broken for an unrelated
// reason — at that EXACT zoom, `map.getSource("layer-ortho")`'s `cog://`
// raster tiles failed to paint at all against the new ortho (the real Esri
// World Imagery basemap showed through instead, confirmed live via
// screenshot + `map.getPaintProperty`/`getLayoutProperty` checks showing
// the layer itself was visible/opacity-1 — a `@geomatico/maplibre-cog-protocol`
// tile-request quirk at that specific integer zoom against this COG's
// overview levels, not a real/duck issue). zoom 19 does not hit that
// quirk (confirmed live, ortho renders correctly) and gives a
// comfortably-sized, non-clipped duck silhouette.
const DUCK_ZOOM = 19;

// ---------------------------------------------------------------------------
// Browser-context types. Declared structurally/minimally (not imported from
// "maplibre-gl") — this file is swept into `next build`'s TypeScript
// program (tsconfig.json's `include: ["**/*.ts"]`), and every call below is
// serialized into `page.evaluate` and executed against the app's OWN
// already-loaded maplibre-gl instance in the browser, not this file's.
// ---------------------------------------------------------------------------

interface TestMap {
  loaded(): boolean;
  jumpTo(opts: { center: [number, number]; zoom: number; pitch: number; bearing: number }): void;
  project(lngLat: [number, number]): { x: number; y: number };
  fitBounds(bounds: [number, number, number, number], opts: { padding: number; duration: number }): void;
  triggerRepaint(): void;
  once(event: "render" | "idle", cb: () => void): void;
  getCanvas(): HTMLCanvasElement;
  getLayer(id: string): { implementation?: { isReady(): boolean } } | undefined;
  getSource(id: string): { bounds?: [number, number, number, number] } | undefined;
  getLayoutProperty(layerId: string, name: string): unknown;
}

interface TestLayerViewerHandle {
  getMap(): TestMap | null;
  toggleLayer(id: string, toggle?: boolean): void;
}

declare global {
  interface Window {
    __layerViewerHandle?: TestLayerViewerHandle | null;
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function waitForHandle(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__layerViewerHandle?.getMap(), null, { timeout: 15_000 });
}

async function waitForMapLoaded(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__layerViewerHandle?.getMap()?.loaded(), null, { timeout: 15_000 });
}

/** Waits for the sample duck's custom layer to report `isReady()` — i.e.
 *  the glTF has fetched/parsed and the NEXT `render()` call will actually
 *  draw it, rather than early-returning (Correction 1's ready-guard). */
async function waitForDuckReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!window.__layerViewerHandle?.getMap()?.getLayer("duck")?.implementation?.isReady(),
    null,
    { timeout: 15_000 },
  );
}

interface DuckMeasurement {
  /** MapLibre's own `map.project()` of the model's real lat/lon anchor —
   *  the EXPECTED screen position per the design discussion's required
   *  verification method. */
  projected: { x: number; y: number };
  /** Intensity centroid of every duck-colored pixel in the captured frame
   *  (css px) — the model's ACTUAL rendered position. */
  centroid: { x: number; y: number } | null;
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** Count of matched device pixels (sampled every 2px) — a sanity floor
   *  so a degenerate "found nothing" case fails loudly and specifically
   *  rather than silently producing a null centroid that happens to dodge
   *  the real assertions below. */
  count: number;
}

/** Jumps the camera to the duck's real anchor at the given pitch/bearing,
 *  captures a real rendered frame, and returns both the expected
 *  (`map.project()`) and actual (duck-colored-pixel centroid/bbox) screen
 *  positions — see this file's header comment for the readback and mask
 *  mechanisms. */
async function measureDuck(page: Page, pitch: number, bearing: number): Promise<DuckMeasurement> {
  return page.evaluate(
    async ({ lat, lon, zoom, pitch, bearing }) => {
      const map = window.__layerViewerHandle!.getMap()!;
      map.jumpTo({ center: [lon, lat], zoom, pitch, bearing });

      const imageData = await new Promise<ImageData>((resolve) => {
        map.once("render", () => {
          const canvas = map.getCanvas();
          const off = document.createElement("canvas");
          off.width = canvas.width;
          off.height = canvas.height;
          const ctx = off.getContext("2d")!;
          ctx.drawImage(canvas, 0, 0);
          resolve(ctx.getImageData(0, 0, off.width, off.height));
        });
        map.triggerRepaint();
      });

      const dpr = window.devicePixelRatio || 1;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let y = 0; y < imageData.height; y += 2) {
        for (let x = 0; x < imageData.width; x += 2) {
          const idx = (y * imageData.width + x) * 4;
          const r = imageData.data[idx];
          const b = imageData.data[idx + 2];
          if (r - b > 100) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            sumX += x;
            sumY += y;
            count++;
          }
        }
      }

      return {
        projected: map.project([lon, lat]),
        centroid: count > 0 ? { x: sumX / count / dpr, y: sumY / count / dpr } : null,
        bbox: count > 0 ? { minX: minX / dpr, minY: minY / dpr, maxX: maxX / dpr, maxY: maxY / dpr } : null,
        count,
      };
    },
    { lat: DUCK_LAT, lon: DUCK_LON, zoom: DUCK_ZOOM, pitch, bearing },
  );
}

async function getOrthoBounds(page: Page): Promise<[number, number, number, number]> {
  const bounds = await page.evaluate(
    () => window.__layerViewerHandle!.getMap()!.getSource("layer-ortho")?.bounds,
  );
  if (!bounds) throw new Error('map.getSource("layer-ortho").bounds was not available — is the manifest loaded?');
  return bounds;
}

/** Frames the (mislocated — see app/(showcase)/components/land-overlay/
 *  page.tsx's KNOWN LIMITATION comment) sample ortho and waits for its
 *  tiles to actually finish loading, so pixel captures reflect real tile
 *  content rather than a still-loading/blank raster. */
async function jumpToOrthoAndWaitIdle(page: Page, bounds: [number, number, number, number]): Promise<void> {
  await page.evaluate((b) => {
    window.__layerViewerHandle!.getMap()!.fitBounds(b, { padding: 20, duration: 0 });
  }, bounds);
  await page.evaluate(async () => {
    const map = window.__layerViewerHandle!.getMap()!;
    await new Promise<void>((resolve) => {
      map.once("idle", () => resolve());
      // Don't hang the whole suite if tiles never settle (e.g. no network) —
      // the pixel-comparison assertions downstream will fail loudly and
      // specifically instead.
      setTimeout(() => resolve(), 8_000);
    });
  });
}

async function forceRepaintAndWaitOneFrame(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const map = window.__layerViewerHandle!.getMap()!;
    await new Promise<void>((resolve) => {
      map.once("render", () => resolve());
      map.triggerRepaint();
    });
  });
}

/** Downsampled RGB fingerprint of the current frame — used only for the
 *  GL-state-pollution regression's clean-vs-after-toggle comparison, which
 *  is entirely self-referential within one test run (two live captures
 *  compared to EACH OTHER, not to a hardcoded golden value), so it's
 *  agnostic to whatever viewport/dpr the running browser actually used. */
async function capturePixelFingerprint(page: Page): Promise<number[][]> {
  return page.evaluate(async () => {
    const map = window.__layerViewerHandle!.getMap()!;
    const imageData = await new Promise<ImageData>((resolve) => {
      map.once("render", () => {
        const canvas = map.getCanvas();
        const off = document.createElement("canvas");
        off.width = canvas.width;
        off.height = canvas.height;
        const ctx = off.getContext("2d")!;
        ctx.drawImage(canvas, 0, 0);
        resolve(ctx.getImageData(0, 0, off.width, off.height));
      });
      map.triggerRepaint();
    });
    const samples: number[][] = [];
    for (let y = 0; y < imageData.height; y += 20) {
      for (let x = 0; x < imageData.width; x += 20) {
        const idx = (y * imageData.width + x) * 4;
        samples.push([imageData.data[idx], imageData.data[idx + 1], imageData.data[idx + 2]]);
      }
    }
    return samples;
  });
}

// ---------------------------------------------------------------------------
// 1 & 2. Numeric placement accuracy — default camera, then the mandatory
// pitch/bearing sweep. Each state runs TWO independent numeric checks:
//
//   (a) CONTAINMENT (primary — this is literally the story's ask): the
//       expected point (`map.project()` of the real anchor) must land
//       inside the duck's actual rendered bounding box, +/- a small
//       anti-aliasing/mask-threshold margin. This holds for ANY correct
//       rigid transform because the anchor (the glTF's local origin,
//       (0,0,0)) is verified — by reading the sample duck's own accessor
//       min/max (public/model3d-samples/duck/model.glb) — to sit WITHIN
//       the mesh's local X/Z (horizontal footprint) extent
//       (x: [-69.3, 96.18], z: [-61.33, 53.93]), so its projection must
//       stay visually on the object regardless of viewing angle.
//   (b) GOLDEN-CENTROID DISTANCE (secondary, tighter, more sensitive to
//       rotation/axis bugs specifically): the measured pixel centroid must
//       be close to a documented, previously-measured value for that
//       exact camera state. Rendering is fully deterministic here (two
//       independent live measurements against the CURRENT, correct code
//       reproduced these golden values to sub-pixel precision), so the
//       tolerance only needs to cover cross-environment/GPU-backend noise
//       — 15px does that generously while staying far tighter than a real
//       bug's signature (see below).
//
// Both checks were validated to actually catch regressions, not just look
// rigorous: dropping the fixed glTF-Y-up -> Mercator-Z-up rotation
// (`rotationX`) from buildModelMatrix's multiply chain — a real,
// plausible bug (a future refactor forgetting one term in `T * S * Rx *
// Rz`) — was deliberately injected during this story's development and
// re-measured live. It shifted the golden-centroid distance to ~90-95px
// at BOTH pitch0/bearing0 and pitch45/bearing90 (a bug that does NOT
// "cancel out" at the default view for this asset), comfortably outside
// the 15px tolerance below. That same injected bug was caught even more
// directly by the new unit test in maplibre-model-layer.test.ts asserting
// the Y-axis handedness sign. resetState() was also temporarily removed
// as a companion sanity check for the GL-state-pollution test (see that
// test's own comment).
// ---------------------------------------------------------------------------

test.describe("numeric placement accuracy (map.project() vs actual rendered position)", () => {
  test("default camera: pitch 0, bearing 0", async ({ page }) => {
    await page.goto(LAND_OVERLAY_URL);
    await waitForHandle(page);
    await waitForMapLoaded(page);
    await waitForDuckReady(page);

    const m = await measureDuck(page, 0, 0);

    expect(m.count, "expected a sizable duck-colored pixel region — found none/too few").toBeGreaterThan(2_000);
    expect(m.bbox).not.toBeNull();
    expect(m.centroid).not.toBeNull();

    const margin = 20; // css px — anti-aliasing / R-B mask threshold edge slop only
    expect(m.projected.x).toBeGreaterThanOrEqual(m.bbox!.minX - margin);
    expect(m.projected.x).toBeLessThanOrEqual(m.bbox!.maxX + margin);
    expect(m.projected.y).toBeGreaterThanOrEqual(m.bbox!.minY - margin);
    expect(m.projected.y).toBeLessThanOrEqual(m.bbox!.maxY + margin);

    // RE-DERIVED AGAIN by the real georeferenced-fix story (new duck
    // anchor at the real Prado parcel's centroid — same DUCK_ZOOM/mask,
    // both re-confirmed live: containment + mask-count assertions above
    // still pass unchanged against the new ortho). Two independent live
    // runs against the current, correct code reproduced this value to
    // sub-pixel precision (deterministic static scene).
    const golden = { x: 363.3190767141887, y: 221.81805838424984 };
    const dist = Math.hypot(m.centroid!.x - golden.x, m.centroid!.y - golden.y);
    expect(dist, `centroid=${JSON.stringify(m.centroid)} golden=${JSON.stringify(golden)}`).toBeLessThanOrEqual(15);
  });

  test("tilted/rotated camera: pitch 45, bearing 90 — the sweep a matrix bug that cancels out at the default view cannot hide from", async ({
    page,
  }) => {
    await page.goto(LAND_OVERLAY_URL);
    await waitForHandle(page);
    await waitForMapLoaded(page);
    await waitForDuckReady(page);

    const m = await measureDuck(page, 45, 90);

    expect(m.count, "expected a sizable duck-colored pixel region — found none/too few").toBeGreaterThan(2_000);
    expect(m.bbox).not.toBeNull();
    expect(m.centroid).not.toBeNull();

    const margin = 20;
    expect(m.projected.x).toBeGreaterThanOrEqual(m.bbox!.minX - margin);
    expect(m.projected.x).toBeLessThanOrEqual(m.bbox!.maxX + margin);
    expect(m.projected.y).toBeGreaterThanOrEqual(m.bbox!.minY - margin);
    expect(m.projected.y).toBeLessThanOrEqual(m.bbox!.maxY + margin);

    // RE-DERIVED by layerviewer-sample-dataset-overhaul — see the default-camera
    // test's own golden comment above for provenance.
    const golden = { x: 331.46, y: 187.44 };
    const dist = Math.hypot(m.centroid!.x - golden.x, m.centroid!.y - golden.y);
    expect(dist, `centroid=${JSON.stringify(m.centroid)} golden=${JSON.stringify(golden)}`).toBeLessThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// 3. GL-state-pollution regression (design-discussion's Correction 4).
// ---------------------------------------------------------------------------

test.describe("GL-state-pollution regression", () => {
  test("ortho layer renders pixel-identically whether or not the model layer has drawn on this GL context", async ({
    page,
  }) => {
    // Ground truth: a page that never adds the model layer at all (see
    // CLEAN_REFERENCE_URL's own comment above for why this — not an
    // early-as-possible capture on the SAME page — is used: the duck's
    // glTF is a local asset that can load fast enough to race an
    // early-page-load capture, which would make "before" not actually
    // "before"; a genuinely model-free page sidesteps that by
    // construction, not by timing).
    await page.goto(CLEAN_REFERENCE_URL);
    await waitForHandle(page);
    await waitForMapLoaded(page);
    const orthoBounds = await getOrthoBounds(page);
    await jumpToOrthoAndWaitIdle(page, orthoBounds);
    const cleanFingerprint = await capturePixelFingerprint(page);

    // The real subject: the page WITH the model layer, after it has
    // rendered at least one frame (Correction 4's exact scenario: three.js's
    // WebGLRenderer mutates GL state as a side effect of render() and MUST
    // call resetState() before returning control to MapLibre, or
    // MapLibre's own subsequent layer draws risk rendering corrupted).
    await page.goto(LAND_OVERLAY_URL);
    await waitForHandle(page);
    await waitForMapLoaded(page);
    await waitForDuckReady(page);
    await jumpToOrthoAndWaitIdle(page, orthoBounds);
    await forceRepaintAndWaitOneFrame(page); // guarantees >=1 real model-layer render+resetState cycle

    // Toggle the ortho layer off then back on — the acceptance criterion's
    // concrete regression scenario — via the SAME imperative-handle path
    // <LayerControl> uses in the real app, not a raw MapLibre call.
    await page.evaluate(() => window.__layerViewerHandle!.toggleLayer("ortho", false));
    await forceRepaintAndWaitOneFrame(page);
    await page.evaluate(() => window.__layerViewerHandle!.toggleLayer("ortho", true));
    // toggleLayer() goes through React state -> an effect -> map.setLayoutProperty
    // — NOT synchronous with the call above (verified live: reading the
    // layout property immediately after returns the stale "none" value) —
    // poll for it to actually flip before capturing.
    await page.waitForFunction(
      () =>
        window.__layerViewerHandle!.getMap()!.getLayoutProperty("layer-ortho-raster", "visibility") === "visible",
      null,
      { timeout: 5_000 },
    );
    await jumpToOrthoAndWaitIdle(page, orthoBounds); // tiles are cached; this just re-settles idle after the flip's repaint
    const afterToggleFingerprint = await capturePixelFingerprint(page);

    expect(afterToggleFingerprint.length).toBe(cleanFingerprint.length);
    let maxChannelDiff = 0;
    let diffSamples = 0;
    let duckPixelsExcluded = 0;
    for (let i = 0; i < cleanFingerprint.length; i++) {
      const [cr, cg, cb] = cleanFingerprint[i];
      const [ar, ag, ab] = afterToggleFingerprint[i];
      // layerviewer-sample-dataset-overhaul: the new sample duck anchor sits
      // at the new (much smaller) parcel's centroid, which this test's own
      // fitBounds-to-ortho-extent framing now brings clearly into view (the
      // OLD duck anchor/ortho combination didn't overlap the sampled region
      // this way — confirmed live by dumping the actual differing samples:
      // every one of them was the duck's own yellow body color
      // (R-B/G-B >100-ish, e.g. [166,140,0]) on the "after" side, vs. real
      // ortho grass/dirt color on the "clean" (model-free) side). Excluding
      // duck-colored samples (same mask convention as
      // measureDuck()/MASK-header-comment above) keeps this regression
      // check honest about what it actually verifies — the ORTHO layer's
      // own pixels, unaffected by three.js GL state — without being
      // defeated by the simple, expected fact that one page has a visible
      // duck drawn over that same region and the other doesn't.
      if (ar - ab > 100) {
        duckPixelsExcluded++;
        continue;
      }
      const diff = Math.max(Math.abs(cr - ar), Math.abs(cg - ag), Math.abs(cb - ab));
      if (diff > maxChannelDiff) maxChannelDiff = diff;
      if (diff > 8) diffSamples++; // small slop for tile-decode/AA nondeterminism, not a real tolerance for corruption
    }
    // Sanity floor: the exclusion above should only ever strip a small
    // minority of samples (the duck's own footprint), never swallow the
    // whole comparison — if this ever fires, the mask/scene changed enough
    // to need a fresh look, not a silently-passing test.
    expect(duckPixelsExcluded, "duck-colored sample exclusion").toBeLessThan(cleanFingerprint.length / 2);
    expect(diffSamples, `maxChannelDiff=${maxChannelDiff} of ${cleanFingerprint.length} samples`).toBe(0);
  });
});
