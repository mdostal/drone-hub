import { Archive, File as FileIcon, FileAudio, FileImage, FileJson, FileText, FileVideo } from "lucide-react";
import type { FileEntry } from "@/lib/file-types";
import { categorizeContentType, categoryLabel, formatBytes } from "./file-list-utils";
import type { FileCategory } from "./file-list-utils";

/**
 * <FileList> — a generic file viewer/download list. See
 * .pHive/epics/nav-video-pipeline-files/docs/design-discussion.md §3d and
 * docs/components/file-list.md.
 *
 * CRITICAL, load-bearing implementation constraint (do not "fix" this):
 * every `FileEntry.url` in `files` is treated as an ALREADY-RESOLVED URL.
 * This component performs NO basePath resolution of its own — no
 * `withBasePath()` call, no `next/link` (built for client-side route
 * navigation; it has no `download` attribute support) — it renders a plain
 * `<a href={url} download>`. `lib/base-path.ts`'s own header comment
 * explicitly prohibits basePath-awareness "inside components/LayerViewer or
 * components/VideoTour themselves — those are the portable, plug-and-play
 * library components and must stay basePath-agnostic"; <FileList> is the
 * same kind of portable component, so the same rule applies. Resolving a
 * root-relative sample path against this deployment's basePath is the
 * SHOWCASE PAGE's job (see app/(showcase)/components/file-list/page.tsx),
 * not this component's.
 *
 * SCOPE BOUNDARY: no fetch/XHR, no storage SDK, no auth check anywhere in
 * this file — it only renders the manifest it's handed. See CLAUDE.md's
 * "Scope boundary" section.
 */
export interface FileListProps {
  files: FileEntry[];
  className?: string;
}

const CATEGORY_ICONS: Record<FileCategory, typeof FileIcon> = {
  image: FileImage,
  pdf: FileText,
  video: FileVideo,
  audio: FileAudio,
  json: FileJson,
  text: FileText,
  archive: Archive,
  other: FileIcon,
};

export function FileList({ files, className }: FileListProps) {
  if (files.length === 0) {
    return <p className={["text-sm text-muted", className].filter(Boolean).join(" ")}>No files.</p>;
  }

  return (
    <ul className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
      {files.map((file) => {
        const category = categorizeContentType(file.contentType);
        const Icon = CATEGORY_ICONS[category];
        return (
          <li
            key={file.url}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
          >
            <Icon aria-label={categoryLabel(category)} className="h-5 w-5 shrink-0 text-muted" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-foreground">{file.name}</span>
              <span className="text-xs text-muted">
                {categoryLabel(category)} · {formatBytes(file.sizeBytes)}
              </span>
            </div>
            {/* Plain <a download>, deliberately not next/link — see this
                component's header comment. */}
            <a
              href={file.url}
              download
              className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:border-accent/70 hover:bg-accent/20"
            >
              Download
            </a>
          </li>
        );
      })}
    </ul>
  );
}
