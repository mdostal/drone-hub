// Public export surface for <FileList> — import from "@/components/FileList"
// (or copy this folder + lib/file-types.ts into a standalone consumer like
// personal-site — everything it transitively imports is scoped to this
// folder + lib/file-types.ts, no app/ or gating deps, no network/storage/
// auth logic of any kind — see FileList.tsx's header comment).
//
// FileEntry.url must be an ALREADY-RESOLVED URL by the time it reaches this
// component — see FileList.tsx's header comment for why (basePath
// resolution is the caller's job, not this portable component's).
export { FileList } from "./FileList";
export type { FileListProps } from "./FileList";
export { categorizeContentType, categoryLabel, formatBytes } from "./file-list-utils";
export type { FileCategory } from "./file-list-utils";

// Re-export the manifest type consumers need to build a files list or type
// this component's props, so importers don't also need to reach into lib/
// directly (same precedent as LayerViewer/index.ts re-exporting LayerDef).
export type { FileEntry } from "@/lib/file-types";
