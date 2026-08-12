import { ImageResponse } from "next/og";
import { brandMarkElement } from "@/lib/brand-mark";

// A plain Route Handler, not the magic icon.tsx/apple-icon.tsx convention —
// this size only exists to be referenced from app/manifest.ts's icons[]
// array (PWA install prompts expect at least a 192px and a 512px icon).
// Next's automatic <link> injection doesn't apply to a manifest's icon
// list, so this route's URL is referenced manually via lib/base-path.ts's
// withBasePath() in manifest.ts, the same pattern this repo already uses
// for every other plain-string asset path.

export async function GET() {
  return new ImageResponse(brandMarkElement(192), { width: 192, height: 192 });
}
