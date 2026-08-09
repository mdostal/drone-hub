"use client";

// Public showcase page for <FileList>. This whole repo carries no gating of
// any kind (see CLAUDE.md's "Scope boundary" section).
//
// public/file-list-samples/*.txt|*.json are tiny, non-sensitive sample
// files (not property data, no contracts, no PII) added solely to
// demonstrate a real, working download link.
//
// withBasePath() is called HERE, at the showcase-page call site, on each
// sample file's url — exactly mirroring
// app/(showcase)/components/layer-viewer/page.tsx's own precedent of
// resolving its manifest's urls before handing them to the component.
// <FileList> itself must stay basePath-agnostic — see FileList.tsx's
// header comment and lib/base-path.ts's own header comment for why.
import { ComponentShowcase } from "@/components/showcase";
import { FileList } from "@/components/FileList";
import type { FileEntry } from "@/components/FileList";
import { withBasePath } from "@/lib/base-path";

const SAMPLE_FILES: FileEntry[] = [
  {
    name: "Notes.txt",
    url: withBasePath("/file-list-samples/sample-notes.txt"),
    sizeBytes: 231,
    contentType: "text/plain",
  },
  {
    name: "Manifest.json",
    url: withBasePath("/file-list-samples/sample-manifest.json"),
    sizeBytes: 177,
    contentType: "application/json",
  },
];

const USAGE_CODE = `import { FileList } from "@/components/FileList";
import type { FileEntry } from "@/components/FileList";
import { withBasePath } from "@/lib/base-path";

// Resolve basePath at the call site — <FileList> takes already-resolved URLs.
const files: FileEntry[] = [
  { name: "Notes.txt", url: withBasePath("/file-list-samples/sample-notes.txt"), sizeBytes: 231, contentType: "text/plain" },
];

<FileList files={files} />`;

export default function FileListShowcasePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="FileList"
        description="Given a typed manifest of already-resolved file URLs, renders an icon/label-by-content-type list with a real download link per file."
        demo={<FileList files={SAMPLE_FILES} />}
        code={USAGE_CODE}
      />
    </main>
  );
}
