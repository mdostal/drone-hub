# `<FileList>` — file viewer / download list (hive spec)

> Given a typed manifest of already-resolved file URLs, renders an icon/label-by-content-
> type list with a real download link per file. No file storage, no fetching a manifest
> from anywhere — it just renders the list it's handed. Plug-and-play, importable into any
> app, publicly showcased at `/components/file-list`.

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/nav-video-pipeline-files/docs/design-discussion.md` §3d — this doc documents
that decision, it does not re-derive it.

## Why (operator intent — honor this)

Same generic-components-only clarification as `<FileUpload>` (see
`docs/components/file-upload.md`'s "Why" section) — this is the "viewing and downloading"
half of the operator's original "files, contracts, back and forth" request, built as a
presentational component against a typed manifest prop, not a real file-storage browser.

## The data type — `FileEntry` (`lib/file-types.ts`)

```ts
export interface FileEntry {
  /** Human-readable display name, e.g. "Site Survey.pdf". */
  name: string;
  /** Already-resolved URL — <FileList> renders this directly as an <a href>. */
  url: string;
  /** File size in bytes, used for the human-readable size label. */
  sizeBytes: number;
  /** MIME type, e.g. "application/pdf" | "image/png" | "application/json". */
  contentType: string;
}
```

Same "typed registry" shape convention as `lib/layer-types.ts`'s `LayerDef` — a property's
downloadable files are a flat `FileEntry[]`, and the type carries no rendering opinion
(icon choice, size formatting) baked in; that's `<FileList>`'s own concern.

## CRITICAL implementation constraint — already-resolved URLs, no internal basePath awareness

This is the load-bearing detail this story exists to get right, corrected by grill during
planning (design-discussion.md §3d, grill finding #2): `<FileList>` takes
**already-resolved URLs** in its `files` manifest and renders a plain
**`<a href={url} download>`** — deliberately:

- **NOT `next/link`.** `next/link` is built for client-side route navigation and has no
  `download` attribute support — it wouldn't trigger a real file download at all for a
  same-origin URL under Next's client router.
- **NOT an internal `withBasePath()` call.** `lib/base-path.ts`'s own header comment
  explicitly prohibits basePath-awareness "inside `components/LayerViewer` or
  `components/VideoTour` themselves — those are the portable, plug-and-play library
  components and must stay basePath-agnostic." `<FileList>` is the exact same kind of
  portable component, so the same rule applies — it would break for any consumer whose
  basePath differs from (or is absent from) drone-hub's own.

basePath resolution is the **showcase page's job**, exactly mirroring how
`app/(showcase)/components/layer-viewer/page.tsx` already calls `withBasePath()` on its
sample manifest before handing it to `<LayerViewer>`:

```tsx
import { FileList } from "@/components/FileList";
import type { FileEntry } from "@/components/FileList";
import { withBasePath } from "@/lib/base-path";

const files: FileEntry[] = [
  {
    name: "Notes.txt",
    url: withBasePath("/file-list-samples/sample-notes.txt"),
    sizeBytes: 231,
    contentType: "text/plain",
  },
];

<FileList files={files} />
```

`components/FileList/FileList.test.tsx`'s scope-boundary self-check reads the actual
`FileList.tsx` source and asserts it never imports `withBasePath` and never imports
`next/link` — a direct check against the real code, not just this doc's claim.

## Behavior

1. **Icon + category label per content type.** `categorizeContentType()`
   (`components/FileList/file-list-utils.ts`, a pure function with its own unit tests)
   buckets a MIME type into `image | pdf | video | audio | json | text | archive | other`;
   `<FileList>` maps each bucket to a `lucide-react` icon (`FileImage`, `FileText`,
   `FileVideo`, `FileAudio`, `FileJson`, `Archive`, or a generic `File` fallback) and a
   human label ("Image", "PDF", "JSON", etc).
2. **Human-readable size.** `formatBytes()` (same file) renders bytes as `"231 B"`,
   `"1.5 KB"`, `"2.5 MB"`, etc — pure and unit-tested independent of any rendering.
3. **One `<a href={url} download>` per entry.** Clicking it downloads the file directly;
   no client-side loading state or intermediate confirmation step is needed for a static
   `public/`-hosted asset.
4. **Empty state.** Given `files={[]}`, it renders `"No files."` rather than an empty
   `<ul>`.

## What this component deliberately does NOT do

- **No fetch of a manifest from anywhere** — the `files` prop is the whole input; the
  caller is responsible for however it obtained that array (a hardcoded sample, a real
  manifest fetched elsewhere in the consuming app, etc).
- **No storage SDK, no auth check** — same self-check discipline as `<FileUpload>`, see
  `FileList.test.tsx`'s scope-boundary spec.
- **No upload path** — this is the read/download half only; see `docs/components/file-upload.md`
  for the write half, a deliberately separate component (not one merged
  upload-and-download component) per this repo's one-directory-per-component convention.

## Sample data — `public/file-list-samples/`

Two tiny, non-sensitive files added specifically to demonstrate a real, working download
link (not raw property data, no contracts, no PII): `sample-notes.txt` (231 bytes,
`text/plain`) and `sample-manifest.json` (177 bytes, `application/json`). The showcase
page hardcodes a `FileEntry[]` pointing at both, matching `<Model3D>`'s "no separate
manifest file for a small P1 scope" precedent (`docs/components/model3d.md`).

## Acceptance criteria

- [x] Given a manifest of already-resolved URLs, when rendered, then it renders plain
      `<a href download>` elements, not `next/link`, and performs no basePath resolution
      internally.
  Verified: `FileList.tsx` contains no `next/link` import and no `withBasePath` call
  (`FileList.test.tsx`'s scope-boundary self-check greps the actual source); the download
  showcase page calls `withBasePath()` itself before passing `files` in, mirroring
  `layer-viewer`'s page.
- [x] Given files with different content types, when rendered, then each shows a
      category-appropriate icon/label.
  Verified: `file-list-utils.test.ts` covers `categorizeContentType()` for every bucket;
  `FileList.test.tsx` confirms the rendered category labels for the sample manifest.
- [x] Given the download link, when clicked, then it resolves to a real, working URL
      (live-verified, not just a prop-wiring assertion).
  Verified live via Playwright against the running dev server: the rendered `href`
  resolved under the dev basePath and the request returned a real 200.
- [x] Given the component's source, when reviewed, then it contains no network call,
      storage access, or auth check of any kind.
  Verified directly by reading `components/FileList/FileList.tsx` and by
  `FileList.test.tsx`'s scope-boundary self-check.
- [x] Given `npm test` and `npm run build`, when run after this story, then both pass
      cleanly.

## Phase fit

- **This story:** `<FileList>` + `FileEntry` + its showcase page + this doc.
- **Deliberately out of scope, permanently:** real file storage/listing (a real manifest
  fetched from R2/S3/a database), auth-gated download links, upload — all belong to the
  separate `personal-drone` platform per `CLAUDE.md`'s "Scope boundary" section.
