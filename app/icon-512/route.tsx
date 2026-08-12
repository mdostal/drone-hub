import { ImageResponse } from "next/og";
import { brandMarkElement } from "@/lib/brand-mark";

// See app/icon-192/route.tsx's header comment — same reasoning, the larger
// of the two sizes app/manifest.ts's icons[] array references.

export async function GET() {
  return new ImageResponse(brandMarkElement(512), { width: 512, height: 512 });
}
