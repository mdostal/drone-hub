import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font/google (no external request at runtime), matching
// mdostal.com/tools.mdostal.com's precedent — see design-discussion.md §3a.
// The `variable` sets --font-inter on <html>, which app/globals.css's
// @theme block wires into --font-sans (and Tailwind's font-sans utility).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// metadataBase anchors the auto-generated opengraph-image.tsx's og:image
// URL to an absolute address (Next requires this for relative image
// metadata to resolve) — the production alias, not a Vercel preview URL,
// since that's the one actually linked from tools.mdostal.com.
const SITE_URL = "https://drone-hub-rust.vercel.app";
const SITE_TITLE = "drone-hub — plug-and-play drone property-intelligence components";
const SITE_DESCRIPTION =
  "A shadcn-style component framework for drone property intelligence — map layer viewer, 3D/point-cloud viewer, geo-anchored model overlay, video walkthrough player, and a Minecraft terrain voxelizer, each with a live demo and full docs.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "drone-hub",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
