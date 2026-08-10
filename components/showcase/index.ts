// Public export surface for the showcase-shell family. Import from
// "@/components/showcase" — everything it transitively imports is scoped to
// this folder, no app/ or gating deps, so it's safe to reuse from a gated
// page later too (see ComponentShowcase.tsx's header comment).
export { ComponentShowcase } from "./ComponentShowcase";
export type { ComponentShowcaseProps } from "./ComponentShowcase";
export { NavStrip } from "./NavStrip";
export type { NavStripItem, NavStripProps } from "./NavStrip";
export { DocsSidebar } from "./DocsSidebar";
export type { DocsSidebarItem, DocsSidebarProps, DocsSidebarSection } from "./DocsSidebar";
