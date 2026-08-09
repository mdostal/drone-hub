import type { ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { cx } from "./cx";

/**
 * <ComponentShowcase> — the shared per-component showcase layout (CLAUDE.md
 * "Vision expansion": a shadcn-style component framework, where every
 * plug-and-play component gets its own page with a live demo + usage
 * snippet, not just to exist as code).
 *
 * Deliberately gating-agnostic: no auth checks, no opinion on public vs
 * gated. It just lays out four things a caller hands it — title,
 * description, a live `demo` instance, and a `code` usage snippet. That's
 * what lets it be reused as-is both here (the public /components/* route
 * group, see app/(showcase)/components/page.tsx) and later inside a gated
 * page (e.g. the queued content-engine page) without any rework.
 *
 * `code` renders in a plain styled <pre><code> block — no syntax-highlighting
 * dependency, per this story's "keep it simple" scope (do_not list).
 */
export interface ComponentShowcaseProps {
  /** Component family name, e.g. "LayerViewer". */
  title: string;
  /** One-line summary of what the component does. */
  description: string;
  /** The live component instance being showcased — caller-supplied. */
  demo: ReactNode;
  /** Usage snippet, rendered verbatim (whitespace preserved). */
  code: string;
  className?: string;
}

export function ComponentShowcase({ title, description, demo, code, className }: ComponentShowcaseProps) {
  return (
    <article className={cx("flex flex-col gap-6", className)}>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-base text-muted">{description}</p>
      </header>

      <section aria-label={`${title} demo`} className="rounded-xl border border-border bg-surface p-4">
        {demo}
      </section>

      <section aria-label={`${title} usage`} className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted">Usage</h2>
          <CopyButton text={code} />
        </div>
        <pre className="overflow-x-auto rounded-xl border border-border bg-surface p-4 text-sm text-foreground">
          <code>{code}</code>
        </pre>
      </section>
    </article>
  );
}
