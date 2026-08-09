import { ImageResponse } from "next/og";

// App Router convention: a file named icon.tsx under app/ is automatically
// served as the site favicon/app icon (no manual <link rel="icon"> needed,
// no static asset to source/store) — Next.js generates it at build time via
// ImageResponse. Design: three offset, overlapping rounded squares (a
// "stacked toggleable layers" glyph — the literal core feature CLAUDE.md
// calls out: "this layer toggle is the killer feature") in white against
// the site's own accent color, so the icon is drawn from the same design
// tokens as the rest of the site (app/globals.css's --color-accent),
// not a separately-sourced image asset.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e8590c",
          borderRadius: 6,
        }}
      >
        <div style={{ position: "relative", width: 18, height: 18, display: "flex" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 4,
              width: 14,
              height: 14,
              borderRadius: 3,
              background: "rgba(255,255,255,0.55)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 4,
              left: 2,
              width: 14,
              height: 14,
              borderRadius: 3,
              background: "rgba(255,255,255,0.75)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 0,
              width: 14,
              height: 14,
              borderRadius: 3,
              background: "#ffffff",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
