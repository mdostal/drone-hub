import { ImageResponse } from "next/og";
import { brandMarkElement } from "@/lib/brand-mark";

// App Router convention: a file named icon.tsx under app/ is automatically
// served as the site favicon/app icon (no manual <link rel="icon"> needed,
// no static asset to source/store) — Next.js generates it at build time via
// ImageResponse. The glyph itself (three offset, overlapping rounded
// squares — a "stacked toggleable layers" mark, the literal core feature
// CLAUDE.md calls out: "this layer toggle is the killer feature") lives in
// lib/brand-mark.tsx, shared with app/apple-icon.tsx and the PWA manifest
// icons so every size is the same mark, not independently hand-tuned.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(brandMarkElement(size.width), { ...size });
}
