"use client";

import { useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";

/**
 * <FileUpload> — a generic drag-and-drop + click-to-browse file picker.
 * See .pHive/epics/nav-video-pipeline-files/docs/design-discussion.md §3d
 * and docs/components/file-upload.md.
 *
 * SCOPE BOUNDARY (deliberate, load-bearing — read before touching this
 * file): this component has NO upload logic of its own. It never calls
 * `fetch`, never touches a storage SDK, never performs auth of any kind.
 * Its only job is turning a drag/drop or a native file-picker selection
 * into a plain `File[]` and handing it to the caller via `onFilesSelected`
 * — what the consuming app does with those `File` objects (upload them
 * somewhere, read them client-side, discard them) is entirely its own
 * business, out of scope for this portable library component. See
 * CLAUDE.md's "Scope boundary" section: real upload/storage/auth logic
 * belongs to the separate personal-drone platform, never here.
 */
export interface FileUploadProps {
  /** Fired with the selected File[] on every drop or file-input change —
   *  the only way this component communicates a selection. No return value
   *  is read; this component does not know or care whether the caller
   *  "did anything" with the files. */
  onFilesSelected: (files: File[]) => void;
  /** Forwarded to the underlying <input type="file"> `multiple` attribute.
   *  Default true (matches drag-and-drop, which naturally accepts multiple
   *  dropped files). */
  multiple?: boolean;
  /** Forwarded to the underlying <input type="file"> `accept` attribute,
   *  e.g. "image/*,.pdf". Omitted → any file type. */
  accept?: string;
  disabled?: boolean;
  className?: string;
}

function filesFromFileList(list: FileList | null): File[] {
  return list ? Array.from(list) : [];
}

export function FileUpload({ onFilesSelected, multiple = true, accept, disabled = false, className }: FileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) return;
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    if (disabled) return;
    const files = filesFromFileList(event.dataTransfer.files);
    if (files.length > 0) onFilesSelected(files);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = filesFromFileList(event.target.files);
    if (files.length > 0) onFilesSelected(files);
    // Reset so selecting the exact same file again still fires a change
    // event next time.
    event.target.value = "";
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Drop files here, or click to browse"
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-surface/50 text-muted opacity-60"
          : isDragActive
            ? "border-accent bg-accent/10 text-accent"
            : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-sm font-medium">
        {isDragActive ? "Drop to select" : "Drag and drop files here, or click to browse"}
      </span>
      <span className="text-xs text-muted">
        {multiple ? "Multiple files supported" : "Single file"}
        {accept ? ` · ${accept}` : ""}
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={handleInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
