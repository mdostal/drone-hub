// Tiny internal classname joiner — avoids pulling in a shared lib/utils.ts
// that no prior story has created yet. Not part of the public API surface
// (not re-exported from index.ts).
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
