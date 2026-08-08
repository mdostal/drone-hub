// Prefixes a root-absolute app path ("/foo/bar") with this deployment's
// basePath, for the client call sites Next's automatic basePath prefixing
// doesn't cover: a `manifest="/..."` string prop, a sample glTF `url` field,
// or any other plain string passed to `fetch`/`<a href>`/`<img src>` rather
// than through <Link>/<Image>/router navigation. See next.config.ts's
// NEXT_PUBLIC_BASE_PATH comment for why this exists — it's the same pattern
// mapstack-us and allergy-locator use for their own tools.mdostal.com mounts.
//
// Do NOT use this inside components/LayerViewer or components/VideoTour
// themselves — those are the portable, plug-and-play library components and
// must stay basePath-agnostic so they work correctly in ANY consuming app
// (with or without a basePath, including apps with a DIFFERENT basePath than
// this one). This helper belongs only at drone-hub's own call sites: the
// app/ pages and showcase pages that hardcode a path to drone-hub's own
// public/ sample data.
export function withBasePath(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}
