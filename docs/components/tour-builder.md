# `<TourBuilder>` — visual `tour.json` authoring tool

> Upload a floorplan image, click it to place rooms, upload a pool of clips/stills, wire up
> doorways between rooms, and export a real, validated `Tour` manifest — the exact shape
> `<VideoTour>` consumes. Plug-and-play, importable into any app, publicly showcased at
> `/components/tour-builder`.

## Why this exists

Every `Tour` manifest in this repo so far (`public/showcase-samples/demo-house/tour.json`)
was hand-written JSON. The operator asked for "an admin tool for building the video
walkthroughs (upload a group of videos and a way to put in a floorplan and move between
them or room to room 360s etc)" — this is that tool: a real room-graph editor instead of
hand-authoring the manifest.

## Scope boundary (read before extending this component)

Same discipline as `<FileUpload>`/`<FileList>`/`<ProcessingStatus>` — see CLAUDE.md's
"Scope boundary" section. **This is an in-browser editor, not a real asset pipeline:**

- Uploaded files (floorplan + media pool) are used for **live preview only**, via
  session-scoped `URL.createObjectURL` blob URLs. Closing the tab loses the in-progress
  edit — there is no persistence, no auto-save, no backend of any kind.
- The exported manifest references each file by its **original filename**
  (`"kitchen-spin.mp4"`), which is a placeholder the author replaces with wherever they
  actually host that file once it's uploaded somewhere real. This tool cannot know or guess
  that eventual URL — same reasoning as `<FileList>`'s "already-resolved URLs" contract,
  just from the authoring side instead of the display side.
- **No fetch, no storage SDK, no auth, no real upload path.** Real upload/hosting/
  persistence (e.g. a real "save this tour to R2 + Supabase" admin flow) belongs to the
  separate `personal-drone` platform, never here.

## The editing model

1. **Floorplan.** One image, uploaded via `<FileUpload multiple={false} accept="image/*">`.
   Clicking anywhere on the rendered image computes a `[x%, y%]` position (from the click's
   offset within the image's `getBoundingClientRect()`) and creates a new `TourRoom` there —
   the same `pos` field `<FloorPlanMap>` already renders inside `<VideoTour>` itself, so a
   tour authored here drops straight into the existing minimap rendering with no conversion.
2. **Media pool.** A second `<FileUpload accept="video/*,image/*">` target collects every
   video/image the author has ready. Every uploaded filename populates a shared
   `<datalist>`, offered as autocomplete on every still/spin/doorway-clip field — so an
   author can either pick an already-uploaded file's name or just type a filename they'll
   upload later, without the tool forcing a rigid dropdown-only choice.
3. **Rooms.** Each placed room gets a card: label, still (required — matches
   `TourRoom.still`'s "Always provide one" contract), spin (optional), and a doorway editor.
4. **Doorways.** Add a directed edge to any other existing room, optionally with a
   transition-clip filename (blank → the existing wipe fallback, exactly like
   `TourEdge.clip: null`). Deleting a room also strips any other room's doorway that pointed
   at it — an author can't be left with a manifest containing a dangling edge just because
   they deleted the wrong room card.
5. **Export.** Real-time JSON preview (`lib/tour-types.ts`'s exact `Tour` shape), a
   `<CopyButton>`, and a real file download (`Blob` + a synthetic `<a download>` click — the
   same "real, working download" bar `<FileList>` and `<MinecraftExport>` already hold).
   The download button is disabled while real validation issues remain unresolved.

## Validation — `tour-builder-utils.ts`'s `validateTour()`

Pure function, structural (not just "is this field non-empty"):

- Slug/title required.
- At least one room.
- `startRoom` must reference a real room id in the manifest.
- Every room needs a label and a still.
- Every doorway's `to` must reference a real room id — this is the check that actually
  matters at runtime: a dangling edge here wouldn't fail to export, it would fail *inside
  `<VideoTour>`* the first time a visitor navigated through it (an edge to nowhere).

Validated live on every edit; issues render as a list next to the export controls, and block
the download button (but never the copy button or the live JSON preview — an author can
still inspect/copy a work-in-progress manifest).

## What this deliberately does NOT do (yet)

- **No drag-to-reposition** — rooms are placed by click, not draggable afterward. A
  reasonable v2 addition, not built here.
- **No automatic still-frame capture from an uploaded spin/clip video** — the author
  supplies a still filename directly; extracting a real thumbnail frame client-side is real,
  separate work (a `<video>` + `<canvas>` capture, or ideally reusing the same `ffmpeg`
  frame-extraction step `/pipeline`'s docs already describe for the nadir-grid pipeline).
- **No real save/load beyond the JSON export/`initialTour` prop** — no draft persistence
  across page reloads (would need `localStorage` at minimum, real storage for anything
  more), out of scope for a stateless framework component.

## Acceptance criteria

- [x] Given a blank builder, when rendered, then real validation issues are shown and the
      download button is disabled.
- [x] Given an uploaded floorplan, when clicked, then a new room is placed at the correct
      `[x%, y%]` and set as the tour's start room if none was set yet.
- [x] Given two valid rooms, when a doorway is added between them, then the exported JSON
      contains a real `TourEdge` with the entered clip filename (or `null` for a wipe).
- [x] Given a room with an inbound doorway from another room, when that room is deleted,
      then the other room's doorway to it is also removed (no dangling edge left behind).
- [x] Given uploaded media files, when added, then their filenames populate the shared
      datalist offered on every still/spin/clip field.
- [x] Given `npm test` and `npm run build`, when run after this story, then both pass
      cleanly.
