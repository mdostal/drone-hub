"use client";

import { useRef, useState } from "react";

type CopyState = "idle" | "copied" | "error";

export interface CopyButtonProps {
  /** The exact text copied to the clipboard on click. */
  text: string;
  className?: string;
}

/**
 * <CopyButton> — shared copy-to-clipboard control for this repo's two
 * code-block renderers: components/showcase/ComponentShowcase.tsx's usage
 * snippet and components/Markdown.tsx's `pre` renderer (doc pages + the
 * ContentEngine page). See
 * .pHive/epics/nav-video-pipeline-files/docs/design-discussion.md §3a.
 *
 * Deliberately NOT feature-detection-gated on `"clipboard" in navigator`.
 * This app is always HTTPS on Vercel, and localhost is a secure context in
 * every major browser — `navigator.clipboard` existing is not actually in
 * question in either of this app's real contexts, so a feature-detection
 * guard would be defending against a non-problem (grill finding #6, see
 * design-discussion.md §3a). The real defensive need is different:
 * `writeText()` returns a Promise that can still reject in a secure context
 * (e.g. a `NotAllowedError` from document-focus loss). The `.catch()` below
 * is what stops a normal click from producing an unhandled promise
 * rejection — that's the actual failure mode this component guards against.
 */
export function CopyButton({ text, className }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick() {
    navigator.clipboard
      .writeText(text)
      .then(() => setState("copied"))
      .catch(() => setState("error"))
      .finally(() => {
        if (resetTimer.current) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setState("idle"), 2000);
      });
  }

  const label = state === "copied" ? "Copied" : state === "error" ? "Couldn't copy" : "Copy";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        "shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground",
        state === "copied" && "border-accent/50 text-accent",
        state === "error" && "border-red-500/50 text-red-500",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </button>
  );
}
