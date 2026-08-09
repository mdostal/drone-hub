// Pure, WebGL/DOM-free helpers extracted out of FileList.tsx so this logic
// is unit-testable without rendering anything — same "extract pure/testable
// logic out of a component" precedent as components/VoxelTerrain/
// voxel-geometry.ts and components/Model3D/Model3D.tsx's toErrorMessage.

export type FileCategory = "image" | "pdf" | "video" | "audio" | "json" | "text" | "archive" | "other";

const ARCHIVE_TYPES = new Set([
  "application/zip",
  "application/x-tar",
  "application/gzip",
  "application/x-7z-compressed",
]);

/** Buckets a MIME content type into a small set of display categories —
 *  drives which icon/label <FileList> renders per entry. Unknown/unusual
 *  types fall back to "other" rather than throwing. */
export function categorizeContentType(contentType: string): FileCategory {
  const type = contentType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/json") return "json";
  if (type.startsWith("text/")) return "text";
  if (ARCHIVE_TYPES.has(type)) return "archive";
  return "other";
}

const CATEGORY_LABELS: Record<FileCategory, string> = {
  image: "Image",
  pdf: "PDF",
  video: "Video",
  audio: "Audio",
  json: "JSON",
  text: "Text",
  archive: "Archive",
  other: "File",
};

/** Human-readable label for a category, e.g. for an icon's aria-label. */
export function categoryLabel(category: FileCategory): string {
  return CATEGORY_LABELS[category];
}

const SIZE_UNITS = ["KB", "MB", "GB", "TB"] as const;

/** Formats a byte count as a human-readable size, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;

  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${SIZE_UNITS[unitIndex]}`;
}
