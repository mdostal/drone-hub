"use client";

// Public showcase page for <ProcessingStatus>. This whole repo carries no
// gating of any kind (see CLAUDE.md's "Scope boundary" section).
//
// The "Cycle demo state" button below requires an explicit click per state
// change — deliberately NOT an auto-advancing simulated job. See
// .pHive/epics/nav-video-pipeline-files/docs/design-discussion.md §3d: on
// this live, public-forever demo site, an automatic queued->processing->done
// sequence could read as a real pipeline run to a first-time visitor.
import { useState } from "react";
import { ComponentShowcase } from "@/components/showcase";
import { ProcessingStatus } from "@/components/ProcessingStatus";
import type { ProcessingStatusValue } from "@/components/ProcessingStatus";

const CYCLE: { status: ProcessingStatusValue; progress?: number }[] = [
  { status: "queued" },
  { status: "processing", progress: 0.25 },
  { status: "processing", progress: 0.75 },
  { status: "done" },
  { status: "error" },
];

const USAGE_CODE = `import { ProcessingStatus } from "@/components/ProcessingStatus";

// Your app owns how status updates arrive (a fetch poll, a websocket
// message, etc) — <ProcessingStatus> only renders what it's handed.
<ProcessingStatus status="processing" progress={0.42} label="site-survey.pdf" />`;

export default function ProcessingStatusShowcasePage() {
  const [index, setIndex] = useState(0);
  const current = CYCLE[index];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <ComponentShowcase
        title="ProcessingStatus"
        description="A typed queued/processing/done/error indicator — presentational only, no polling or websocket logic of its own."
        demo={
          <div className="flex flex-col gap-4">
            <ProcessingStatus status={current.status} progress={current.progress} label="sample-job.zip" />
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % CYCLE.length)}
              className="w-fit rounded-full border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:border-accent-dark hover:bg-accent-dark"
            >
              Cycle demo state
            </button>
            <p className="text-xs text-muted">
              Demo only — click the button above to manually step through queued → processing → done → error. This
              does not run or simulate any real job.
            </p>
          </div>
        }
        code={USAGE_CODE}
      />
    </main>
  );
}
