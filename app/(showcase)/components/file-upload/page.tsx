"use client";

// Public showcase page for <FileUpload>. This whole repo carries no gating
// of any kind (see CLAUDE.md's "Scope boundary" section).
//
// The onFilesSelected handler below is a NO-OP demo, deliberately labeled
// as such in the UI — it only lists the selected filenames in local state,
// it does not upload anything anywhere. See
// .pHive/epics/nav-video-pipeline-files/docs/design-discussion.md §3d: this
// demo control must be visually unmistakable as inert, not readable as a
// real upload confirmation.
import { useState } from "react";
import { ComponentShowcase } from "@/components/showcase";
import { FileUpload } from "@/components/FileUpload";

const USAGE_CODE = `import { FileUpload } from "@/components/FileUpload";

<FileUpload
  onFilesSelected={(files) => {
    // Your app owns what happens next — upload, read client-side, etc.
    // <FileUpload> itself never makes a network call.
  }}
/>`;

export default function FileUploadShowcasePage() {
  const [selectedNames, setSelectedNames] = useState<string[]>([]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="FileUpload"
        description="A drag-and-drop + click-to-browse target. Hands the caller a plain File[] via onFilesSelected — no upload logic of its own."
        demo={
          <div className="flex flex-col gap-4">
            <FileUpload onFilesSelected={(files) => setSelectedNames(files.map((f) => f.name))} />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Selected (demo only — nothing is uploaded):
              </p>
              {selectedNames.length === 0 ? (
                <p className="mt-1 text-sm text-muted">No files selected yet.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-0.5 text-sm text-foreground">
                  {selectedNames.map((name, i) => (
                    <li key={`${name}-${i}`}>{name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
