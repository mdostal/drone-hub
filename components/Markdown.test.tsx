// Regression coverage for the shared <Markdown> component
// (components/Markdown.tsx), extracted from
// app/(showcase)/docs/components/[slug]/page.tsx so both that route and
// app/properties/[slug]/engine/EnginePageClient.tsx render markdown through
// one styled pattern instead of duplicating it (and, for EnginePageClient,
// as the actual bug fix — it previously interpolated a raw markdown string
// directly into a <pre>, which rendered `# heading`/`**bold**`/`| table |`
// syntax verbatim instead of formatted prose).
//
// Mirrors app/(showcase)/docs/components/[slug]/page.test.tsx's direct
// checks of the (now-shared) MARKDOWN_COMPONENTS rendering, including its
// `node`-prop-leak regression test — see that file's "react-markdown's
// extra `node` prop does not leak into DOM attributes" describe block for
// the original discovery of that bug.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

describe("<Markdown>", () => {
  it("renders heading, bold, and table markdown syntax as real HTML elements, not literal text", () => {
    const source = [
      "# Engineering Notes",
      "",
      "**Sample/placeholder content.**",
      "",
      "| Component | Material |",
      "| --- | --- |",
      "| Roofing | asphalt shingle |",
    ].join("\n");

    const { container } = render(<Markdown>{source}</Markdown>);

    expect(screen.getByRole("heading", { level: 1, name: "Engineering Notes" })).toBeInTheDocument();
    expect(screen.getByText("Sample/placeholder content.").tagName).toBe("STRONG");
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelectorAll("td").length).toBeGreaterThan(0);

    // The literal markdown syntax must not survive into rendered text — this
    // is the actual bug: a plain string interpolated into JSX renders these
    // characters verbatim instead of being consumed by the parser.
    expect(container.textContent).not.toContain("# Engineering Notes");
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("| Component | Material |");
  });

  it("supports GFM task-list checkboxes via remark-gfm", () => {
    const { container } = render(<Markdown>{"- [x] done\n- [ ] not done"}</Markdown>);

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
    expect(container.textContent).not.toContain("[x]");
    expect(container.textContent).not.toContain("[ ]");
  });

  it("does not leak react-markdown's extra `node` prop into DOM attributes", () => {
    // Every custom renderer in MARKDOWN_COMPONENTS must destructure `node`
    // out before spreading `...rest` onto its native DOM element — skipping
    // that leaks a literal node="[object Object]" attribute. jsdom accepts
    // unknown attributes silently, so this must inspect actual serialized
    // HTML rather than rely on a text-content assertion.
    const source = "# H1\n\n## H2\n\n> quote\n\n**bold** `code` [link](/x)\n\n---\n\n- item";
    const { container } = render(<Markdown>{source}</Markdown>);

    expect(container.innerHTML).not.toContain("[object Object]");
    expect(container.querySelectorAll("[node]").length).toBe(0);
  });
});

describe("<Markdown> — copy-to-clipboard on fenced code blocks", () => {
  it("renders a copy button alongside each `pre` block, wired to that block's exact code text", () => {
    const source = ["```ts", "const x = 1;", "```"].join("\n");
    const { container } = render(<Markdown>{source}</Markdown>);

    const button = screen.getByRole("button", { name: "Copy" });
    expect(container.querySelector("pre")).not.toBeNull();
    // The button lives alongside the <pre>, not nested inside it (so it
    // doesn't get selected/copied along with the code text itself).
    const pre = container.querySelector("pre") as HTMLElement;
    expect(pre.contains(button)).toBe(false);
  });
});
