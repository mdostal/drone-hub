// Reads drone-hub's `docs/components/*.md` files directly at request time —
// nothing here duplicates their content into this server's own source. If a
// doc changes on disk, the next tool call reflects that change immediately,
// with no redeploy/rebuild step.
//
// Real, observed structure of every doc under docs/components/ (confirmed by
// reading layer-viewer.md, video-tour.md, model3d.md, file-upload.md,
// file-list.md, tour-builder.md, flight-coverage-analyzer.md, and skimming
// the rest — all 12 files, not assumed from one sample):
//
//   # `<ComponentName>` — short title (hive spec)
//
//   > One-line (occasionally multi-line) summary, sometimes with **bold**
//   > or `code` markdown spans. Every single doc opens this way — an H1
//   > title line, a blank line, then an immediate blockquote. There is no
//   > YAML frontmatter anywhere in this doc family.
//
// list_components extracts its one-line description from that opening
// blockquote (stripping the leading "> " and markdown emphasis/code spans),
// not from any hardcoded/duplicated catalog.
//
// The "## Usage" section + its fenced code block is NOT consistently placed:
// some docs (content-engine.md, land-overlay.md, minecraft-export.md,
// voxel-terrain.md) have an explicit "## Usage" heading immediately followed
// by a fenced snippet; others (file-upload.md, model3d.md,
// processing-status.md) show the same kind of import+JSX snippet under a
// differently-named heading (e.g. "## The showcase page"); and a few
// (layer-viewer.md, video-tour.md, tour-builder.md, flight-coverage-
// analyzer.md) don't contain a fenced usage snippet at all — they only show
// prop shapes as inline code or type-only fenced blocks. get_component_usage
// handles all three cases: a "## Usage" section's first fenced block, a
// fallback to the first ```tsx block anywhere in the doc, and a clear error
// (not a crash, not undefined) when neither exists.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// mcp/component-catalog/lib/catalog.js -> repo root is three levels up.
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
export const DOCS_DIR = path.join(REPO_ROOT, "docs", "components");

// Slugs come from real filenames on disk, so this only needs to guard
// against path traversal / surprising characters, not enumerate a fixed list.
const SAFE_SLUG_PATTERN = /^[a-z0-9-]+$/;

export class UnknownSlugError extends Error {
  constructor(slug, availableSlugs) {
    super(
      `Unknown component slug: "${slug}". Available slugs: ${availableSlugs.join(", ")}`,
    );
    this.name = "UnknownSlugError";
  }
}

export class NoUsageSnippetError extends Error {
  constructor(slug) {
    super(
      `No usage code snippet found in docs/components/${slug}.md. ` +
        `This doc shows its API as inline code / type-only blocks rather than ` +
        `a fenced usage example — call get_component_docs("${slug}") to read the ` +
        `full page instead.`,
    );
    this.name = "NoUsageSnippetError";
  }
}

/** Lists the real *.md filenames (without extension) under docs/components/, sorted. */
async function listSlugs() {
  const entries = await readdir(DOCS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.slice(0, -".md".length))
    .sort();
}

function assertSafeSlug(slug) {
  if (typeof slug !== "string" || !SAFE_SLUG_PATTERN.test(slug)) {
    throw new UnknownSlugError(String(slug), []);
  }
}

async function readDoc(slug) {
  assertSafeSlug(slug);
  const filePath = path.join(DOCS_DIR, `${slug}.md`);
  try {
    return await readFile(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      const availableSlugs = await listSlugs();
      throw new UnknownSlugError(slug, availableSlugs);
    }
    throw err;
  }
}

/** Strips light markdown emphasis/code-span/link markup so a description reads as plain text. */
function stripInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold**
    .replace(/`([^`]+)`/g, "$1") // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](link)
    .trim();
}

/**
 * Extracts {title, description} from a doc's real header shape: an H1 title
 * line, then the opening blockquote as the description. Falls back to a
 * generic placeholder for either piece if a doc ever deviates from that
 * shape, rather than throwing — list_components must return something real
 * for every file under docs/components/, not skip one that's slightly off.
 */
export function extractSummary(content, slug) {
  const lines = content.split("\n");

  let title = slug;
  let titleLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("# ")) {
      title = stripInlineMarkdown(line.slice(2).trim());
      titleLineIndex = i;
      break;
    }
  }

  const blockquoteLines = [];
  if (titleLineIndex !== -1) {
    let i = titleLineIndex + 1;
    while (i < lines.length && lines[i].trim() === "") i++; // skip blank lines
    while (i < lines.length && lines[i].trimStart().startsWith(">")) {
      blockquoteLines.push(lines[i].trimStart().replace(/^>\s?/, ""));
      i++;
    }
  }

  const description = blockquoteLines.length
    ? stripInlineMarkdown(blockquoteLines.join(" ").replace(/\s+/g, " ").trim())
    : "(no summary blockquote found at the top of this doc)";

  return { title, description };
}

/** All components/tools found under docs/components/*.md, read fresh from disk. */
export async function listComponents() {
  const slugs = await listSlugs();
  const results = [];
  for (const slug of slugs) {
    const content = await readFile(path.join(DOCS_DIR, `${slug}.md`), "utf8");
    const { title, description } = extractSummary(content, slug);
    results.push({ slug, title, description });
  }
  return results;
}

/** The full raw markdown for docs/components/<slug>.md. */
export async function getComponentDocs(slug) {
  return readDoc(slug);
}

/**
 * Finds the first fenced code block (```lang ... ```) within a slice of markdown
 * text. Returns {lang, code} or null if none is present in that slice.
 */
function firstFencedBlock(text) {
  const match = text.match(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/);
  if (!match) return null;
  return { lang: match[1] || "text", code: match[2].replace(/\n$/, "") };
}

/**
 * Extracts just the usage code snippet from a doc, per the fallback chain
 * documented in this file's header comment:
 *   1. The first fenced block under an explicit "## Usage" heading.
 *   2. Otherwise, the first ```tsx fenced block anywhere in the doc.
 *   3. Otherwise, a clear NoUsageSnippetError (never undefined/a crash).
 */
export function extractUsage(content, slug) {
  const usageHeadingMatch = content.match(/^##\s+Usage\s*$/m);
  if (usageHeadingMatch) {
    const sectionStart = usageHeadingMatch.index + usageHeadingMatch[0].length;
    const rest = content.slice(sectionStart);
    const nextHeadingMatch = rest.match(/^##\s+/m);
    const section = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;
    const block = firstFencedBlock(section);
    if (block) return block;
  }

  const tsxMatch = content.match(/```tsx\n([\s\S]*?)```/);
  if (tsxMatch) {
    return { lang: "tsx", code: tsxMatch[1].replace(/\n$/, "") };
  }

  throw new NoUsageSnippetError(slug);
}

/** Just the usage code snippet for docs/components/<slug>.md, not the whole page. */
export async function getComponentUsage(slug) {
  const content = await readDoc(slug);
  return extractUsage(content, slug);
}
