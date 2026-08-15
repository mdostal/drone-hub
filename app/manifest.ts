import type { MetadataRoute } from "next";
import { withBasePath } from "@/lib/base-path";

// App Router convention: manifest.ts is automatically served as
// /manifest.webmanifest with Next auto-injecting the
// <link rel="manifest"> tag (basePath-prefixed the same way app/icon.png's
// auto-generated <link rel="icon"> already is — verified live). The icon
// `src` values below point at public/icons/*.png and are plain strings,
// which Next's own metadata-file machinery does NOT basePath-prefix on
// their own, so they go through withBasePath() per this repo's established
// convention (see lib/base-path.ts).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "drone-hub",
    short_name: "drone-hub",
    description:
      "A shadcn-style component framework for drone property intelligence — map layer viewer, 3D/point-cloud viewer, geo-anchored model overlay, video walkthrough player, and a Minecraft terrain voxelizer.",
    start_url: withBasePath("/"),
    display: "standalone",
    background_color: "#09090a",
    theme_color: "#e8590c",
    icons: [
      {
        src: withBasePath("/icons/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: withBasePath("/icons/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
