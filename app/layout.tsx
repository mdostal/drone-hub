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

export const metadata: Metadata = {
  title: "Drone Hub",
  description: "Property-intelligence drone platform.",
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
