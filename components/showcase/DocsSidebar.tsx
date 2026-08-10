"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";

export interface DocsSidebarItem {
  name: string;
  href: string;
}

export interface DocsSidebarSection {
  title: string;
  items: readonly DocsSidebarItem[];
}

export interface DocsSidebarProps {
  sections: readonly DocsSidebarSection[];
}

/**
 * <DocsSidebar> — the persistent left-nav for the `/docs/*` section
 * (app/(showcase)/docs/layout.tsx), the shadcn-style "real docs site, not
 * just a card grid" experience the operator asked for on 2026-08-10: an
 * Introduction/About page plus every component's writeup, all reachable
 * from one persistent sidebar instead of backtracking to `/` between
 * pages. Deliberately separate from <NavStrip> (the horizontal strip on
 * `/components/*` live-demo pages) — the two route families keep their
 * own nav treatment rather than forcing one shared component to serve
 * both a wide horizontal strip and a tall sidebar.
 *
 * "use client" only for usePathname() active-route highlighting — the
 * wrapping app/(showcase)/docs/layout.tsx stays a plain Server Component
 * so `/docs/components/[slug]`'s static prerendering (generateStaticParams)
 * is unaffected, same isolation precedent NavStrip's own header comment
 * documents.
 */
export function DocsSidebar({ sections }: DocsSidebarProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className="w-full shrink-0 sm:w-56">
      <ul className="flex list-none gap-1 overflow-x-auto sm:flex-col sm:gap-4 sm:overflow-visible">
        {sections.map((section) => (
          <li key={section.title} className="shrink-0 sm:shrink">
            <p className="hidden px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted sm:block">
              {section.title}
            </p>
            <ul className="flex list-none gap-1 sm:flex-col">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.name} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                        active ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface hover:text-foreground",
                      )}
                    >
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
