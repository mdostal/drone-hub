# `<ProcessingStatus>` — presentational job-status indicator (hive spec)

> A typed `queued | processing | done | error` (+ optional 0-1 `progress`) status
> indicator. Presentational only — no polling, no websocket, no job orchestration of any
> kind. Plug-and-play, importable into any app, publicly showcased at
> `/components/processing-status`.

**Design discussion (RESOLVED architecture — read first):**
`.pHive/epics/nav-video-pipeline-files/docs/design-discussion.md` §3d — this doc documents
that decision, it does not re-derive it.

## Why (operator intent — honor this)

The "processing" half of the operator's original "files, contracts, back and forth,
viewing and downloading, uploading, processing" request — clarified the same way as
`<FileUpload>`/`<FileList>` (see `docs/components/file-upload.md`'s "Why" section):
generic, backend-free, presentational only. A real WebODM/photogrammetry job's actual
status (CLAUDE.md's data pipeline: nadir passes → WebODM → ortho/DSM/mesh) will need
*some* UI to show its state eventually — this component is that UI, decoupled entirely
from how the status data arrives.

## The contract

```ts
export type ProcessingStatusValue = "queued" | "processing" | "done" | "error";

export interface ProcessingStatusProps {
  status: ProcessingStatusValue;
  /** 0-1 fraction complete. Only rendered as a progress bar while
   *  status === "processing"; ignored for the other three states. */
  progress?: number;
  /** Optional filename/job label shown alongside the status. */
  label?: string;
  className?: string;
}
```

There is no `onStatusChange`, no internal state machine, no timer. `<ProcessingStatus>`
renders exactly the `status`/`progress` it's handed on the current render — a new render
with different props is the only way its output changes. How those props arrive (a
`fetch` poll, a websocket message, a manual demo click) is entirely the consuming app's
concern.

## Behavior

1. **A colored status dot + text label**, one of four fixed states:
   - `queued` — muted grey dot, "Queued".
   - `processing` — accent-colored, gently pulsing dot (`animate-pulse`), "Processing".
   - `done` — green dot, "Done".
   - `error` — red dot, "Error".
2. **A progress bar, only for `processing` with a numeric `progress`.** `clampProgress()`
   (`components/ProcessingStatus/ProcessingStatus.tsx`, pure and unit-tested) clamps an
   out-of-range value (e.g. a stray `1.4` or `-0.1` or `NaN`) into `[0, 1]` before it's used
   to compute the bar's width, so a bad caller-supplied value can't blow up the rendered
   width or produce `NaN%`. The percentage is also shown as text next to the status label
   (e.g. `"Processing (42%)"`).
3. **`done`/`error`/`queued` never show a bar**, even if `progress` happens to be passed —
   only `processing` renders one. This keeps the visual language unambiguous: a bar
   implies "still going," which `done`/`error` are not.
4. **Optional `label`** (e.g. a filename) renders alongside the status text, and feeds the
   `role="status"` region's `aria-label` (`"{label}: {status text}"`) for screen readers.

## What this component deliberately does NOT do

- **No polling, no websocket subscription, no `setInterval`/`setTimeout` of any kind** —
  `components/ProcessingStatus/ProcessingStatus.test.tsx`'s scope-boundary self-check reads
  the actual source and asserts none of these appear, plus a live-render spec that
  confirms the component's own output never changes across a real time delay without a
  prop update (i.e., it isn't secretly auto-advancing).
- **No fetch/XHR, no storage SDK, no auth check.**
- **No job orchestration logic** (retry, cancel, queue position) — this is a status
  *display*, not a job controller.

## The showcase page — a manual "Cycle demo state" button, not an auto-advancing job

`/components/processing-status` (`app/(showcase)/components/processing-status/page.tsx`)
demos the four states plus two progress values via a small hardcoded cycle array and a
**"Cycle demo state" button that requires an explicit click per state change** —
deliberately *not* a `setInterval`-driven simulated job. This is a direct response to
design-discussion.md §3d's grill finding #7: on a live, public-forever demo site, an
automatic `queued → processing → done` sequence could read as a real pipeline job running
to a first-time visitor if it weren't unmistakably a manual, caller-driven control.

```tsx
import { ProcessingStatus } from "@/components/ProcessingStatus";

<ProcessingStatus status="processing" progress={0.42} label="site-survey.pdf" />
```

## Acceptance criteria

- [x] Given the state-cycling control is used, when clicked, then it requires an explicit
      user action per state change, not an automatic simulated job.
  Verified: the showcase page's "Cycle demo state" `<button onClick>` advances a single
  `index` step per click, no timer anywhere in the page or the component; live-verified via
  Playwright that the rendered status does not change without a click.
- [x] Given `status="processing"` and a `progress` value, when rendered, then a
      proportionally-widthed bar and matching percentage render; given any other status,
      no bar renders even if `progress` is passed.
  Verified: `ProcessingStatus.test.tsx` covers both cases directly.
- [x] Given the component's source, when reviewed, then it contains no
      polling/websocket/timer logic, no network call, no storage access, and no auth
      check of any kind.
  Verified directly by reading `components/ProcessingStatus/ProcessingStatus.tsx` and by
  `ProcessingStatus.test.tsx`'s scope-boundary self-check, which greps the actual source
  for `fetch(`/`XMLHttpRequest`/`WebSocket`/`setInterval`/`setTimeout`/`@aws-sdk`/
  session-or-auth-header patterns and asserts none appear.
- [x] Given `npm test` and `npm run build`, when run after this story, then both pass
      cleanly.

## Phase fit

- **This story:** `<ProcessingStatus>` + its showcase page + this doc.
- **Deliberately out of scope, permanently:** real job polling/websocket wiring, retry/
  cancel controls, and any pipeline orchestration — those belong to whatever app actually
  runs the job (the separate `personal-drone` platform, or `/pipeline`'s own eventual
  tooling per `CLAUDE.md`), never to this presentational component.
