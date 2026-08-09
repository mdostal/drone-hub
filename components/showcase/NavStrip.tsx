"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";

export interface NavStripItem {
  name: string;
  href: string;
}

export interface NavStripProps {
  items: readonly NavStripItem[];
}

/**
 * <NavStrip> — the persistent wayfinding strip app/(showcase)/layout.tsx
 * renders on every /components/* and /docs/components/* page (CLAUDE.md's
 * "shadcn-style component framework" vision: a visitor jumping between
 * components shouldn't have to backtrack to the root ToC each time). See
 * .pHive/epics/nav-video-pipeline-files/docs/design-discussion.md §3a.
 *
 * This is its own client component ONLY because active-route highlighting
 * needs `usePathname()`, which needs a client boundary. The shared
 * app/(showcase)/layout.tsx that renders it stays a plain Server Component
 * — see design-discussion.md §3a grill finding #5: making the whole shared
 * layout "use client" would needlessly widen the client boundary for the
 * entire showcase+docs subtree, including
 * app/(showcase)/docs/components/[slug]/page.tsx, which is fully static
 * today and must stay that way (this story's named acceptance criterion).
 */
export function NavStrip({ items }: NavStripProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Components" className="border-b border-border bg-background">
      <ul className="mx-auto flex max-w-3xl list-none gap-1 overflow-x-auto px-8 py-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.name} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  active ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                {item.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
