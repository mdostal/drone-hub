import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

// Minimal per-element styling so the rendered markdown reads correctly
// under this app's Tailwind v4 preflight reset (which strips default
// list/heading UA styles) rather than rendering as flat, unstyled text —
// content-engine.md's nested numbered lists, bold+italic+inline-code
// mixing, ASCII directory-tree code block, and 3 fenced code blocks are
// the spot-check target (design-discussion.md's grill-revised risk
// section) for this not visually breaking. No syntax highlighter (plain
// <pre><code>, react-markdown's default for fenced code blocks) and no
// rehype-raw plugin (none of the 7 docs contain raw HTML blocks that need
// it — verified by grepping all 7 for block-level HTML tags).
// react-markdown calls each custom renderer with an extra `node` prop (the
// underlying hast node) alongside the standard DOM props — every renderer
// below must destructure it out before spreading `...rest` onto a native
// DOM element. Skipping that (spreading the raw props object directly)
// leaks `node` through as a literal `node="[object Object]"` HTML
// attribute on every single styled element, found via a manual dev-server
// render check during this story's verification (not caught by any of the
// vitest+RTL specs, since jsdom happily accepts an unknown attribute and
// none of the text-content assertions look at attributes).
type WithNode<T> = T & { node?: unknown };

const MARKDOWN_COMPONENTS = {
  h1: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"h1">>) => (
    <h1 className="mt-8 text-3xl font-semibold first:mt-0" {...rest} />
  ),
  h2: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"h2">>) => (
    <h2 className="mt-8 text-2xl font-semibold" {...rest} />
  ),
  h3: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"h3">>) => (
    <h3 className="mt-6 text-xl font-semibold" {...rest} />
  ),
  p: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"p">>) => (
    <p className="mt-4 leading-7 text-foreground" {...rest} />
  ),
  ul: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"ul">>) => (
    <ul className="mt-4 list-disc space-y-1 pl-6" {...rest} />
  ),
  ol: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"ol">>) => (
    <ol className="mt-4 list-decimal space-y-1 pl-6" {...rest} />
  ),
  li: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"li">>) => (
    <li className="leading-7" {...rest} />
  ),
  blockquote: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"blockquote">>) => (
    <blockquote className="mt-4 border-l-2 border-border pl-4 italic text-muted" {...rest} />
  ),
  code: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"code">>) => (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-sm text-foreground" {...rest} />
  ),
  pre: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"pre">>) => (
    <pre
      className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface p-4 font-mono text-sm text-foreground [&>code]:bg-transparent [&>code]:p-0"
      {...rest}
    />
  ),
  a: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"a">>) => (
    <a className="text-accent underline hover:text-accent-dark" {...rest} />
  ),
  strong: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"strong">>) => (
    <strong className="font-semibold" {...rest} />
  ),
  hr: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"hr">>) => (
    <hr className="mt-8 border-border" {...rest} />
  ),
  input: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"input">>) => (
    // GFM task-list checkboxes (- [x] / - [ ]) — remark-gfm renders these
    // as a real <input type="checkbox" disabled>. Keep them interactive-
    // looking (not literal bracket text) but non-editable, since this is
    // read-only rendered prose.
    <input className="mr-2 align-middle" {...rest} disabled />
  ),
};

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
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {markdown}
        </ReactMarkdown>
      </article>
    </main>
  );
}
