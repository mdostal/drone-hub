/**
 * <ProcessingStatus> — a generic, presentational job-status indicator. See
 * .pHive/epics/nav-video-pipeline-files/docs/design-discussion.md §3d and
 * docs/components/processing-status.md.
 *
 * SCOPE BOUNDARY (deliberate, load-bearing — read before touching this
 * file): this component has NO polling/websocket/subscription logic of its
 * own. It renders whatever `status`/`progress` the caller hands it on this
 * render — how those values arrive (a fetch poll, a websocket message, a
 * dev-only click handler on a showcase page) is entirely the consuming
 * app's concern, out of scope here. See CLAUDE.md's "Scope boundary"
 * section: real pipeline/job orchestration logic belongs to the separate
 * personal-drone platform, never here.
 */
export type ProcessingStatusValue = "queued" | "processing" | "done" | "error";

export interface ProcessingStatusProps {
  status: ProcessingStatusValue;
  /** 0-1 fraction complete. Only rendered as a progress bar while
   *  `status === "processing"`; ignored for the other three states. */
  progress?: number;
  /** Optional filename/job label shown alongside the status, e.g.
   *  "site-survey.pdf". */
  label?: string;
  className?: string;
}

const STATUS_META: Record<ProcessingStatusValue, { text: string; dotClassName: string; textClassName: string }> = {
  queued: { text: "Queued", dotClassName: "bg-muted", textClassName: "text-muted" },
  processing: { text: "Processing", dotClassName: "bg-accent animate-pulse", textClassName: "text-accent" },
  done: { text: "Done", dotClassName: "bg-green-500", textClassName: "text-green-600 dark:text-green-400" },
  error: { text: "Error", dotClassName: "bg-red-500", textClassName: "text-red-600 dark:text-red-400" },
};

/** Clamps a fraction into [0, 1] — a caller-supplied `progress` outside
 *  that range (e.g. a stray 1.4 or -0.1) shouldn't blow up the rendered
 *  bar's width. Pure, exported for unit coverage without rendering. */
export function clampProgress(progress: number): number {
  if (Number.isNaN(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function ProcessingStatus({ status, progress, label, className }: ProcessingStatusProps) {
  const meta = STATUS_META[status];
  const showBar = status === "processing" && typeof progress === "number";
  const clamped = showBar ? clampProgress(progress) : 0;

  return (
    <div
      role="status"
      aria-label={label ? `${label}: ${meta.text}` : meta.text}
      className={["flex flex-col gap-1.5", className].filter(Boolean).join(" ")}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={["h-2.5 w-2.5 shrink-0 rounded-full", meta.dotClassName].join(" ")} />
        {label && <span className="truncate text-sm font-medium text-foreground">{label}</span>}
        <span className={["text-sm font-medium", meta.textClassName].join(" ")}>
          {meta.text}
          {showBar ? ` (${Math.round(clamped * 100)}%)` : ""}
        </span>
      </div>
      {showBar && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${clamped * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
