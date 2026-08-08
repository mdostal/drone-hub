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
// DUCK-COLORED-PIXEL MASK: `R - B > 60` on the captured RGBA buffer. The
// classic Khronos "Duck" sample glTF (public/model3d-samples/duck/model.glb,
// the same asset <Model3D>'s showcase page uses) is yellow-bodied/
// orange-beaked; live-sampled at the duck's real anchor coordinates, its
// body/beak pixels cluster at R-B in roughly [140, 255], while every
// background this scene can show at that location (Esri World Imagery
// satellite tiles, Esri's "Map data not available" placeholder texture for
// this remote-Arctic sample coordinate — see
// app/(showcase)/components/land-overlay/page.tsx's own KNOWN LIMITATION
// comment for why the ortho itself never paints here — and the sample
// parcel's green boundary fill/line) clusters at R-B in roughly [-15, 35].
// 60 sits with wide margin on both sides.
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
// full provenance).
const DUCK_LAT = 73.46748426410694;
const DUCK_LON = -56.808326092516914;
// Live-tuned against the real showcase page: at this zoom the duck renders
// as a clearly-visible, non-degenerate silhouette (tens of thousands of
// sampled device pixels) comfortably inside the canvas — zoom 19 was tried
// first and found too close (the duck's curved body fills/exceeds the
// entire frame, no usable silhouette edges); zoom 17 under-fills it. 18
// lands cleanly in between.
const DUCK_ZOOM = 18;

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
          if (r - b > 60) {
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

    const golden = { x: 353.05, y: 233.22 }; // see header comment for provenance
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

    const golden = { x: 329.88, y: 160.17 };
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
    for (let i = 0; i < cleanFingerprint.length; i++) {
      const [cr, cg, cb] = cleanFingerprint[i];
      const [ar, ag, ab] = afterToggleFingerprint[i];
      const diff = Math.max(Math.abs(cr - ar), Math.abs(cg - ag), Math.abs(cb - ab));
      if (diff > maxChannelDiff) maxChannelDiff = diff;
      if (diff > 8) diffSamples++; // small slop for tile-decode/AA nondeterminism, not a real tolerance for corruption
    }
    expect(diffSamples, `maxChannelDiff=${maxChannelDiff} of ${cleanFingerprint.length} samples`).toBe(0);
  });
});
