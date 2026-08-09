import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";

// Renders the repo's existing docs/components/*.md files as real pages, so
// the landing page's (framework-docs-site-landing-page, a sibling story)
// "doc writeup" links resolve to actual content instead of a 404. See
// .pHive/epics/framework-docs-site/docs/design-discussion.md §2 ("Doc
// rendering") and this story's yaml for the full rationale.
//
// Public, ungated — this whole repo carries no gating of any kind (see
// CLAUDE.md's "Scope boundary" section); these are framework docs.

// Hardcoded literal array — NOT a fs.readdirSync scan of docs/components/.
// That directory used to also contain a reference/ subdirectory
// (docs/components/reference/prado-tour.prototype.html — removed 2026-08-08,
// it embedded real property photos as base64 image data) that wasn't a
// slug; an unfiltered readdirSync-based enumeration would have picked it up
// as an entry, and a subsequent readFileSync on it throws EISDIR at build
// time, breaking `next build` (grill finding — see design-discussion.md §2
// and this story's risks block). The hardcoded array sidesteps any such
// non-.md entry entirely, present or not: every slug here has a matching
// docs/components/<slug>.md file on disk.
const KNOWN_SLUGS = [
  "video-tour",
  "layer-viewer",
  "model3d",
  "land-overlay",
  "voxel-terrain",
  "content-engine",
  "minecraft-export",
  "file-upload",
  "file-list",
  "processing-status",
  "flight-coverage-analyzer",
  "tour-builder",
] as const;

type KnownSlug = (typeof KNOWN_SLUGS)[number];

function isKnownSlug(slug: string): slug is KnownSlug {
  return (KNOWN_SLUGS as readonly string[]).includes(slug);
}

// All seven docs are static prose content known at build time — prerender
// them fully to static HTML (○) rather than leaving the route dynamic (ƒ).
// This isn't just a performance nicety: it sidesteps a real production
// risk. fs.readFileSync against docs/ at *request* time could 404 on
// Vercel's serverless runtime if the build tracer doesn't include docs/**
// in the function's file trace. A page that fully prerenders at build time
// never touches fs after the build completes, so that risk doesn't apply
// here. Verify via `next build`'s route table showing ○ (Static) for all
// seven /docs/components/<slug> routes.
export function generateStaticParams() {
  return KNOWN_SLUGS.map((slug) => ({ slug }));
}

// The themed per-element renderers (headings/lists/code/tables/etc, and the
// `node`-prop-destructuring discipline react-markdown custom renderers
// require — see that file's header comment for the full explanation) now
// live in the shared components/Markdown.tsx, so both this route and
// app/properties/[slug]/engine/EnginePageClient.tsx render markdown through
// the same styled pattern instead of duplicating it.
export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Guard against an arbitrary path segment reaching readFileSync — for
  // any slug not in the hardcoded KNOWN_SLUGS array, call notFound()
  // rather than attempting a read.
  if (!isKnownSlug(slug)) {
    notFound();
  }

  const filePath = path.join(process.cwd(), "docs", "components", `${slug}.md`);
  const markdown = fs.readFileSync(filePath, "utf-8");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <Link href="/" className="text-sm text-muted hover:text-accent">
        ← Components
      </Link>
      <article>
        <Markdown>{markdown}</Markdown>
      </article>
    </main>
  );
}
