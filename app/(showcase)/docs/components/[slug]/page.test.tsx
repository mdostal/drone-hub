// BDD specs for the /docs/components/[slug] doc-rendering route
// (framework-docs-site-render-route.yaml). This is an async Server
// Component (fs.readFileSync + notFound() are only legal server-side), so
// it isn't rendered via `render(<DocPage params={...} />)` the way plain
// client/presentational components are elsewhere in this repo (see
// app/(showcase)/components/page.test.tsx) — instead the async function is
// invoked directly and awaited to resolve the JSX tree (same
// call-the-async-function-directly approach a Server Component with no
// synchronous render path requires), then that resolved element is handed
// to RTL's `render`.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DocPage, { generateStaticParams } from "./page";

const DOCS_DIR = path.join(process.cwd(), "docs", "components");

describe("generateStaticParams", () => {
  it("returns exactly the 10 hardcoded known slugs, not a directory scan", () => {
    // The hard constraint this story exists to enforce: a literal array,
    // not fs.readdirSync(DOCS_DIR). docs/components/ used to also contain a
    // reference/ subdirectory (removed 2026-08-08 — it held a prototype
    // file embedding real property photos) that a readdirSync-based
    // enumeration would've picked up as a bogus 8th "slug" and thrown
    // EISDIR on at build time the moment a page tried to readFileSync it.
    // The hardcoded array protects against any such non-.md entry, present
    // or not — asserting the exact set AND count here is what would catch
    // a regression back to a readdirSync-based implementation.
    //
    // file-upload/file-list/processing-status added by the
    // generic-file-components story (nav-video-pipeline-files epic).
    const params = generateStaticParams();

    expect(params).toEqual([
      { slug: "video-tour" },
      { slug: "layer-viewer" },
      { slug: "model3d" },
      { slug: "land-overlay" },
      { slug: "voxel-terrain" },
      { slug: "content-engine" },
      { slug: "minecraft-export" },
      { slug: "file-upload" },
      { slug: "file-list" },
      { slug: "processing-status" },
    ]);
  });

  it("every returned slug has a matching docs/components/<slug>.md file on disk", () => {
    for (const { slug } of generateStaticParams()) {
      expect(fs.existsSync(path.join(DOCS_DIR, `${slug}.md`))).toBe(true);
    }
  });
});

describe("<DocPage> — rendering a known slug", () => {
  it("Given a request to /docs/components/layer-viewer, when the page renders, then it displays the actual content of docs/components/layer-viewer.md", async () => {
    // Pulled from the REAL file at test time, not a hardcoded copy written
    // into this test — the point is proving the route reads the real file
    // off disk, not that the test and the implementation happen to agree
    // on a literal string chosen by hand.
    const realMarkdown = fs.readFileSync(path.join(DOCS_DIR, "layer-viewer.md"), "utf-8");
    const firstHeadingLine = realMarkdown.split("\n")[0];
    // Strip markdown syntax (leading "# " and inline-code backticks) to
    // get the text as it will actually appear in rendered DOM text nodes —
    // react-markdown consumes that syntax rather than passing it through
    // literally.
    const expectedText = firstHeadingLine.replace(/^#\s*/, "").replace(/`/g, "");
    expect(expectedText.length).toBeGreaterThan(10); // sanity: precondition didn't degenerate to ""

    const element = await DocPage({ params: Promise.resolve({ slug: "layer-viewer" }) });
    render(element);

    expect(screen.getByText((_, node) => node?.textContent === expectedText)).toBeInTheDocument();
  });

  it("renders a distinctive mid-document string unique to layer-viewer.md, further proving it's not another doc's content", async () => {
    const realMarkdown = fs.readFileSync(path.join(DOCS_DIR, "layer-viewer.md"), "utf-8");
    expect(realMarkdown).toContain("Hammer Missions");

    const element = await DocPage({ params: Promise.resolve({ slug: "layer-viewer" }) });
    const { container } = render(element);

    expect(container.textContent).toContain("Hammer Missions");
  });

  it("renders the '← Components' back link pointing at /", async () => {
    const element = await DocPage({ params: Promise.resolve({ slug: "layer-viewer" }) });
    render(element);

    expect(screen.getByRole("link", { name: /Components/ })).toHaveAttribute("href", "/");
  });
});

describe("<DocPage> — GFM task-list checkboxes", () => {
  it("Given docs/components/layer-viewer.md's '- [x]' task-list items, when rendered, then they render as actual checkbox inputs, not literal bracket text", async () => {
    const realMarkdown = fs.readFileSync(path.join(DOCS_DIR, "layer-viewer.md"), "utf-8");
    const checkedItemCount = (realMarkdown.match(/^- \[x\]/gm) ?? []).length;
    expect(checkedItemCount).toBeGreaterThan(0); // precondition: the fixture doc actually has task-list items

    const element = await DocPage({ params: Promise.resolve({ slug: "layer-viewer" }) });
    const { container } = render(element);

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(checkedItemCount);
    checkboxes.forEach((checkbox) => expect(checkbox).toBeChecked());

    // The literal bracket syntax must NOT survive into rendered text —
    // this is what proves remark-gfm is actually wired in, not just that
    // plain react-markdown happened to render something reasonable.
    expect(container.textContent).not.toContain("[x]");
  });

  it("Given docs/components/video-tour.md's '- [ ]' unchecked task-list item, when rendered, then it renders as an unchecked checkbox input", async () => {
    const realMarkdown = fs.readFileSync(path.join(DOCS_DIR, "video-tour.md"), "utf-8");
    expect(realMarkdown).toMatch(/^- \[ \]/m); // precondition: an unchecked item exists in the fixture doc

    const element = await DocPage({ params: Promise.resolve({ slug: "video-tour" }) });
    const { container } = render(element);

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const uncheckedBoxes = Array.from(checkboxes).filter((checkbox) => !(checkbox as HTMLInputElement).checked);
    expect(uncheckedBoxes.length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("[ ]");
  });
});

describe("<DocPage> — the structurally densest doc (content-engine.md) renders without breaking", () => {
  it("Given content-engine.md's nested numbered lists, bold+italic+inline-code mixing, an ASCII directory-tree block, and its fenced code blocks, when rendered, then every fenced block becomes a <pre> and none of it falls through as raw '```' text", async () => {
    const realMarkdown = fs.readFileSync(path.join(DOCS_DIR, "content-engine.md"), "utf-8");
    const fenceLines = realMarkdown.match(/^```/gm) ?? [];
    expect(fenceLines.length % 2).toBe(0); // sanity: fences are balanced open/close pairs
    const expectedFencedBlockCount = fenceLines.length / 2;
    expect(expectedFencedBlockCount).toBeGreaterThanOrEqual(3);

    const element = await DocPage({ params: Promise.resolve({ slug: "content-engine" }) });
    const { container } = render(element);

    expect(container.querySelectorAll("pre").length).toBe(expectedFencedBlockCount);
    // No raw fence markers leaked through as literal text anywhere on the page.
    expect(container.textContent).not.toContain("```");

    // The ASCII directory tree (public/content-engine/.../sample-house/
    // etc.) is one of those fenced blocks — its distinctive content should
    // survive verbatim inside a <pre>, not be mangled by markdown parsing.
    const preTexts = Array.from(container.querySelectorAll("pre")).map((pre) => pre.textContent ?? "");
    expect(preTexts.some((text) => text.includes("sample-house"))).toBe(true);

    // Nested numbered list ("1. **Fallback direction**...", "2. ...", "3. ...").
    expect(container.querySelectorAll("ol").length).toBeGreaterThan(0);

    // Bold + italic + inline-code mixing.
    expect(container.querySelectorAll("strong").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("em").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("code").length).toBeGreaterThan(0);
  });
});

describe("<DocPage> — react-markdown's extra `node` prop does not leak into DOM attributes", () => {
  it("renders no element with a literal node=\"[object Object]\" attribute (regression: custom renderers must destructure `node` out before spreading props)", async () => {
    // Caught during this story's manual dev-server verification (curling
    // /docs/components/content-engine): react-markdown calls each custom
    // component renderer with an extra `node` prop alongside standard DOM
    // props. Spreading that object directly onto a native DOM element
    // leaks it as an invalid `node="[object Object]"` attribute on every
    // styled element. jsdom accepts unknown attributes silently, so a
    // plain text-content assertion wouldn't catch this — this test
    // inspects the actual serialized HTML.
    const element = await DocPage({ params: Promise.resolve({ slug: "content-engine" }) });
    const { container } = render(element);

    expect(container.innerHTML).not.toContain("[object Object]");
    expect(container.querySelectorAll("[node]").length).toBe(0);
  });
});

describe("<DocPage> — unknown slug", () => {
  it("Given a request to /docs/components/nonexistent-slug, when the page renders, then Next's notFound() fires instead of a crash from a failed readFileSync", async () => {
    await expect(
      DocPage({ params: Promise.resolve({ slug: "nonexistent-slug" }) }),
    ).rejects.toMatchObject({
      // next/navigation's notFound() throws an Error whose `digest` is this
      // exact string (see node_modules/next/dist/client/components/{not-found,http-access-fallback/http-access-fallback}.js)
      // — a stable, version-pinned signal that distinguishes "notFound()
      // was called" from an arbitrary thrown error (e.g. an ENOENT from a
      // readFileSync that should never have been attempted for this slug).
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  it("never reaches the reference/ subdirectory path even though it lives alongside the real docs", async () => {
    // "reference" is deliberately not in KNOWN_SLUGS — confirm requesting
    // it 404s via notFound() rather than readFileSync attempting (and
    // failing on) docs/components/reference.md, which doesn't exist, or
    // worse, treating docs/components/reference (the directory) as a file.
    await expect(
      DocPage({ params: Promise.resolve({ slug: "reference" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
