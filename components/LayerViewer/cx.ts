// Tiny internal classname joiner — mirrors components/VideoTour/cx.ts exactly
// (same repo precedent: avoid pulling in a shared lib/utils.ts no story has
// created yet). Duplicated per-component-family on purpose, not shared
// across families, and not part of this family's public API (not
// re-exported from index.ts).
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
