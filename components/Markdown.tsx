"use client";

import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "@/components/CopyButton";

// Shared themed markdown renderer — extracted from
// app/(showcase)/docs/components/[slug]/page.tsx (the original call site)
// so app/properties/[slug]/engine/EnginePageClient.tsx can render its
// engineeringMarkdown prop through the exact same styled pattern instead of
// dumping the raw string into a <pre> (which rendered `# Engineering
// Notes`, `**bold**`, and `| table |` syntax verbatim to visitors — the bug
// this component fixes).
//
// A Client Component ("use client") so it can be imported from either
// context: the doc-page route (an async Server Component reading
// docs/components/*.md off disk) and EnginePageClient.tsx (already a
// Client Component). Server Components can render Client Components, so
// this works from both without duplicating the renderers object.
//
// react-markdown calls each custom renderer with an extra `node` prop (the
// underlying hast node) alongside the standard DOM props — every renderer
// below must destructure it out before spreading `...rest` onto a native
// DOM element. Skipping that (spreading the raw props object directly)
// leaks `node` through as a literal `node="[object Object]"` HTML
// attribute on every single styled element (the doc-page route's original
// bug, guarded by its own regression test — see this repo's
// page.test.tsx's "react-markdown's extra `node` prop does not leak into
// DOM attributes" describe block). Do not reintroduce it here.
type WithNode<T> = T & { node?: unknown };

// Recursively flattens a `pre` renderer's `children` (react-markdown hands
// it a `<code>` element wrapping one or more text nodes) down to the raw
// code string, for handing to <CopyButton>. Walks arrays and nested
// elements rather than assuming a single string child, so it stays correct
// even if a future remark/rehype plugin (e.g. syntax highlighting) splits
// the code content across multiple nested `<span>`s.
function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return "";
}

export const MARKDOWN_COMPONENTS = {
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
  pre: ({ node: _node, children, ...rest }: WithNode<React.ComponentPropsWithoutRef<"pre">>) => (
    <div className="group relative mt-4">
      <pre
        className="overflow-x-auto rounded-xl border border-border bg-surface p-4 font-mono text-sm text-foreground [&>code]:bg-transparent [&>code]:p-0"
        {...rest}
      >
        {children}
      </pre>
      <CopyButton text={extractText(children)} className="absolute right-2 top-2" />
    </div>
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
  table: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"table">>) => (
    <table className="mt-4 w-full border-collapse text-left text-sm" {...rest} />
  ),
  thead: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"thead">>) => (
    <thead className="border-b border-border" {...rest} />
  ),
  th: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"th">>) => (
    <th className="p-2 font-medium" {...rest} />
  ),
  td: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"td">>) => (
    <td className="border-b border-border p-2" {...rest} />
  ),
  input: ({ node: _node, ...rest }: WithNode<React.ComponentPropsWithoutRef<"input">>) => (
    // GFM task-list checkboxes (- [x] / - [ ]) — remark-gfm renders these
    // as a real <input type="checkbox" disabled>. Keep them interactive-
    // looking (not literal bracket text) but non-editable, since this is
    // read-only rendered prose.
    <input className="mr-2 align-middle" {...rest} disabled />
  ),
};

export interface MarkdownProps {
  children: string;
  className?: string;
}

/** Renders a markdown string (GFM-flavored) through this repo's themed
 *  renderers. Use this instead of interpolating a raw markdown string
 *  directly into JSX — a plain string renders as escaped, unparsed text
 *  (literal `#`/`**`/`|` syntax visible to users), not formatted prose. */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
