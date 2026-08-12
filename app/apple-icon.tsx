import { ImageResponse } from "next/og";
import { brandMarkElement } from "@/lib/brand-mark";

// App Router convention: apple-icon.tsx is automatically served as the
// iOS/iPadOS home-screen and Safari-bookmark icon (the
// <link rel="apple-touch-icon"> Next.js emits for it) — no static PNG to
// source, same shared glyph as app/icon.tsx at Apple's own recommended
// 180x180 size. Without this, iOS falls back to a screenshot of the page
// as the "icon," which is the actual gap this file closes.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(brandMarkElement(size.width), { ...size });
}
