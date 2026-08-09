# `<FileUpload>` — drag-and-drop / click-to-browse file picker (hive spec)

> A generic drag-and-drop + click-to-browse target. Hands the caller a plain `File[]` via
> `onFilesSelected` — it has no upload logic of its own. Plug-and-play, importable into any
> app, publicly showcased at `/components/file-upload`.

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/nav-video-pipeline-files/docs/design-discussion.md` §3d — this doc documents
that decision, it does not re-derive it.

## Why (operator intent — honor this)

The operator's original request for this stream of work ("files, contracts, back and
forth, viewing and downloading, uploading, processing") was clarified via an
`AskUserQuestion` during planning: **generic reusable components only.** No backend, no
auth, no storage, no real contract/business logic. That logic belongs entirely to the
separate `personal-drone` platform (see `CLAUDE.md`'s "Scope boundary" section). This
component ships exactly the presentational, backend-free half of "uploading" — turning a
drag/drop or a native file-picker selection into a `File[]`, nothing more.

## The contract — deliberately minimal

```ts
export interface FileUploadProps {
  /** Fired with the selected File[] on every drop or file-input change —
   *  the only way this component communicates a selection. */
  onFilesSelected: (files: File[]) => void;
  /** Forwarded to the underlying <input type="file"> `multiple` attribute.
   *  Default true. */
  multiple?: boolean;
  /** Forwarded to the underlying <input type="file"> `accept` attribute,
   *  e.g. "image/*,.pdf". Omitted → any file type. */
  accept?: string;
  disabled?: boolean;
  className?: string;
}
```

`onFilesSelected` is the entire surface. There is no `onUploadStart`, no `onUploadProgress`,
no `onUploadComplete` — those would imply this component performs an upload, which it
never does. What the consuming app does with the resulting `File[]` (POST it somewhere,
read it client-side with `FileReader`, discard it) is entirely its own business.

## Behavior

1. **Click-to-browse.** The whole target is `role="button"` + keyboard-focusable
   (`tabIndex={0}`, Enter/Space triggers the same path as a click). Clicking (or pressing
   Enter/Space while focused) calls `.click()` on a visually-hidden native
   `<input type="file">` — this is what actually opens the OS file picker; there's no
   custom picker UI to build or maintain.
2. **Drag-and-drop.** `onDragOver`/`onDragEnter` set a visual "drag active" state (border
   and text switch to the accent color); `onDragLeave` clears it; `onDrop` reads
   `event.dataTransfer.files`, converts it to a plain `File[]` via `Array.from`, and calls
   `onFilesSelected` if it's non-empty. `event.preventDefault()` is called on all three —
   without it, the browser's default behavior is to navigate away and load the dropped
   file as if it were a normal page load.
3. **Native file-input change.** Selecting via the OS picker fires the input's `change`
   event; the handler converts `event.target.files` to a `File[]` the same way and calls
   `onFilesSelected`. The input's `value` is reset to `""` afterward, specifically so
   selecting the exact same file again still fires a fresh `change` event next time (the
   DOM doesn't fire `change` for a no-op selection otherwise).
4. **`disabled`.** Suppresses both paths — click-to-browse is a no-op, drop is a no-op —
   and the target renders with muted, non-interactive styling
   (`cursor-not-allowed`, `aria-disabled`).

## What this component deliberately does NOT do

- **No network call of any kind.** No `fetch`, no `XMLHttpRequest`, no upload progress —
  see this file's own header comment and `components/FileUpload/FileUpload.test.tsx`'s
  scope-boundary self-check, which reads the actual source and asserts none of these
  appear.
- **No storage SDK.** Never imports `@aws-sdk/client-s3` or any other storage client — the
  R2/S3 upload target CLAUDE.md's data pipeline eventually needs is entirely the consuming
  app's concern.
- **No auth check.** This component has no concept of who is uploading or whether they're
  allowed to.
- **No file validation/size limits beyond the native `accept` attribute** — a real
  size/type/virus check belongs server-side in whatever app actually receives the files.

## The showcase page — deliberately inert demo

`/components/file-upload` (`app/(showcase)/components/file-upload/page.tsx`) wires
`onFilesSelected` to a **no-op handler** that only stores the selected filenames in local
React state and lists them under the label **"Selected (demo only — nothing is
uploaded):"** — chosen specifically so a first-time visitor to this live, public-forever
demo site can't mistake the filename list for a real upload confirmation (see
design-discussion.md §3d's grill finding #7).

```tsx
import { FileUpload } from "@/components/FileUpload";

<FileUpload
  onFilesSelected={(files) => {
    // Your app owns what happens next — <FileUpload> itself never makes a network call.
  }}
/>
```

## Acceptance criteria

- [x] Given files dropped onto the target, when dropped, then `onFilesSelected` fires with
      the dropped `File[]`.
  Verified: `FileUpload.test.tsx`'s drop spec simulates a `dataTransfer.files` drop and
  asserts the callback receives the exact `File[]`.
- [x] Given a file chosen via the native file input, when selected, then
      `onFilesSelected` fires with the chosen `File[]`.
  Verified: `FileUpload.test.tsx`'s change spec.
- [x] Given the FileUpload demo, when files are selected, then the UI clearly labels the
      resulting filename list as a non-functional demo, not an upload confirmation.
  Verified: the showcase page's "Selected (demo only — nothing is uploaded):" label,
  live-verified via Playwright against the running dev server.
- [x] Given the component's source, when reviewed, then it contains no network call,
      storage access, or auth check of any kind.
  Verified directly by reading `components/FileUpload/FileUpload.tsx` (not just this
  story's own claim) and by `FileUpload.test.tsx`'s scope-boundary self-check, which greps
  the actual source for `fetch(`/`XMLHttpRequest`/`@aws-sdk`/session-or-auth-header
  patterns and asserts none appear.
- [x] Given `npm test` and `npm run build`, when run after this story, then both pass
      cleanly.

## Phase fit

- **This story (`generic-file-components`, `nav-video-pipeline-files` epic):**
  `<FileUpload>` as a standalone, backend-free picker + its showcase page + this doc.
- **Deliberately out of scope, permanently (not deferred):** any real upload
  network/storage/auth logic. That's the separate `personal-drone` platform's job, per
  `CLAUDE.md`'s "Scope boundary" section — not a future drone-hub story.
