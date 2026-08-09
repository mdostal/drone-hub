// Typed registry for <FileList> — same "typed registry" shape convention as
// lib/layer-types.ts's LayerDef. A property's downloadable files (contracts,
// reports, exports — whatever a consuming app hands it) are a flat LIST of
// already-resolved entries. See components/FileList/FileList.tsx's header
// comment for why "already-resolved" is load-bearing: this type carries a
// real `url` string, not a path this repo's own withBasePath() should touch
// — that resolution happens at the call site (a showcase/app page), never
// inside the portable component itself.

/** One downloadable file entry — name, an ALREADY-RESOLVED url, its size in
 *  bytes, and a MIME content type used to pick a display icon/label. */
export interface FileEntry {
  /** Human-readable display name, e.g. "Site Survey.pdf". */
  name: string;
  /** Already-resolved URL (absolute, or root-relative including any
   *  basePath the consuming app needs) — <FileList> renders this directly
   *  as an <a href>, performing no resolution of its own. */
  url: string;
  /** File size in bytes, used for the human-readable size label. */
  sizeBytes: number;
  /** MIME type, e.g. "application/pdf" | "image/png" | "application/json".
   *  Drives the icon/label <FileList> renders per entry. */
  contentType: string;
}
