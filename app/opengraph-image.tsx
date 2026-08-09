import { ImageResponse } from "next/og";

// App Router convention: opengraph-image.tsx under app/ is automatically
// wired into the page's <meta property="og:image">/Twitter card metadata —
// no manual asset to source or link tag to write. Generated from the same
// design tokens as the rest of the site (app/globals.css's dark background +
// accent), so a shared link (Slack, Twitter, tools.mdostal.com) shows a real
// preview instead of nothing.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#09090a",
          padding: "80px 96px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: 14, marginBottom: 40 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: "#e8590c" }} />
          <div
            style={{
              fontSize: 28,
              color: "#9ca3af",
              display: "flex",
              alignItems: "center",
            }}
          >
            drone-hub
          </div>
        </div>
        <div
          style={{
            fontSize: 68,
            fontWeight: 700,
            color: "#f4f4f5",
            lineHeight: 1.1,
            display: "flex",
            maxWidth: 900,
          }}
        >
          Drone property-intelligence, as components.
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#9ca3af",
            display: "flex",
            maxWidth: 820,
          }}
        >
          A shadcn-style framework — map layers, 3D, video tours, terrain — each with a live demo.
        </div>
      </div>
    ),
    { ...size },
  );
}
