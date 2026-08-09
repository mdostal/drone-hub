"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { FileUpload } from "@/components/FileUpload";
import { CopyButton } from "@/components/CopyButton";
import type { Tour, TourRoom } from "@/lib/tour-types";
import { createEdge, createRoom, nextRoomId, tourToJson, validateTour } from "./tour-builder-utils";

/**
 * <TourBuilder> — a visual authoring tool that produces a `Tour` manifest
 * (lib/tour-types.ts) for <VideoTour>, instead of hand-writing tour.json.
 * Upload a floorplan image, click it to place rooms, upload a pool of
 * clips/stills, wire up doorways between rooms, and export a real,
 * validated tour.json.
 *
 * SCOPE BOUNDARY (same discipline as <FileUpload>/<FileList>/
 * <ProcessingStatus> — see CLAUDE.md's "Scope boundary" section): this is
 * an in-browser EDITOR, not a real asset pipeline. Uploaded files are used
 * for live preview only (via `URL.createObjectURL`, session-scoped blob
 * URLs) — the exported manifest references each file by its original
 * FILENAME (e.g. "kitchen-spin.mp4"), a placeholder the author replaces
 * with wherever they actually host that file. No fetch, no storage SDK, no
 * auth, no persistence — closing the tab loses the in-progress edit, same
 * as any other client-only tool in this repo. Real upload/hosting/
 * persistence belongs to the separate personal-drone platform.
 */
export interface TourBuilderProps {
  /** Seed the editor with an existing manifest (e.g. to touch up a
   *  previously-exported tour.json). Omitted → starts from a blank tour. */
  initialTour?: Tour;
  className?: string;
}

function emptyTour(): Tour {
  return { slug: "", title: "", startRoom: "", rooms: [] };
}

function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TourBuilder({ initialTour, className }: TourBuilderProps) {
  const [tour, setTour] = useState<Tour>(initialTour ?? emptyTour());
  const [floorplanFile, setFloorplanFile] = useState<File | null>(null);
  const [floorplanUrl, setFloorplanUrl] = useState<string | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);
  const mediaListId = useId();

  // Blob URLs are only valid for this tab's lifetime -- revoke the old one
  // whenever the floorplan changes or the component unmounts, so we don't
  // leak object URLs across edits.
  useEffect(() => {
    if (!floorplanFile) {
      setFloorplanUrl(null);
      return;
    }
    const url = URL.createObjectURL(floorplanFile);
    setFloorplanUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [floorplanFile]);

  function handleFloorplanSelected(files: File[]) {
    if (files[0]) setFloorplanFile(files[0]);
  }

  function handleMediaSelected(files: File[]) {
    setMediaFiles((prev) => [...prev, ...files]);
  }

  function handleFloorplanClick(event: ReactMouseEvent<HTMLImageElement>) {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = Math.round(((event.clientX - rect.left) / rect.width) * 100);
    const yPct = Math.round(((event.clientY - rect.top) / rect.height) * 100);
    const id = nextRoomId(tour.rooms);
    const room = createRoom(id, [xPct, yPct]);
    setTour((t) => ({
      ...t,
      rooms: [...t.rooms, room],
      startRoom: t.startRoom || id,
    }));
  }

  function updateRoom(id: string, patch: Partial<TourRoom>) {
    setTour((t) => ({ ...t, rooms: t.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  }

  function deleteRoom(id: string) {
    setTour((t) => ({
      ...t,
      startRoom: t.startRoom === id ? "" : t.startRoom,
      rooms: t.rooms
        .filter((r) => r.id !== id)
        .map((r) => ({ ...r, neighbors: r.neighbors.filter((edge) => edge.to !== id) })),
    }));
  }

  function addEdge(roomId: string, toId: string) {
    if (!toId) return;
    setTour((t) => ({
      ...t,
      rooms: t.rooms.map((r) => (r.id === roomId ? { ...r, neighbors: [...r.neighbors, createEdge(toId)] } : r)),
    }));
  }

  function removeEdge(roomId: string, index: number) {
    setTour((t) => ({
      ...t,
      rooms: t.rooms.map((r) =>
        r.id === roomId ? { ...r, neighbors: r.neighbors.filter((_, i) => i !== index) } : r,
      ),
    }));
  }

  function updateEdgeClip(roomId: string, index: number, clip: string) {
    setTour((t) => ({
      ...t,
      rooms: t.rooms.map((r) =>
        r.id === roomId
          ? { ...r, neighbors: r.neighbors.map((e, i) => (i === index ? { ...e, clip: clip || null } : e)) }
          : r,
      ),
    }));
  }

  const issues = useMemo(() => validateTour(tour), [tour]);
  const json = useMemo(() => tourToJson(tour), [tour]);

  return (
    <div className={["flex flex-col gap-6", className].filter(Boolean).join(" ")}>
      <datalist id={mediaListId}>
        {mediaFiles.map((file) => (
          <option key={file.name} value={file.name} />
        ))}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Slug</span>
          <input
            value={tour.slug}
            onChange={(e) => setTour((t) => ({ ...t, slug: e.target.value }))}
            placeholder="2806-prado"
            className="rounded-lg border border-border bg-surface px-2 py-1 text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Title</span>
          <input
            value={tour.title}
            onChange={(e) => setTour((t) => ({ ...t, title: e.target.value }))}
            placeholder="2806 Prado"
            className="rounded-lg border border-border bg-surface px-2 py-1 text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Start room</span>
          <select
            value={tour.startRoom}
            onChange={(e) => setTour((t) => ({ ...t, startRoom: e.target.value }))}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-foreground"
          >
            <option value="">— select —</option>
            {tour.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label || r.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Floorplan</span>
          <FileUpload multiple={false} accept="image/*" onFilesSelected={handleFloorplanSelected} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Media pool ({mediaFiles.length} file{mediaFiles.length === 1 ? "" : "s"})
          </span>
          <FileUpload accept="video/*,image/*" onFilesSelected={handleMediaSelected} />
        </div>
      </div>

      {floorplanUrl && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">Click the floorplan to place a room.</p>
          <div className="relative inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- session-scoped blob: URL, not an app asset next/image can optimize */}
            <img
              ref={imgRef}
              src={floorplanUrl}
              alt="Floorplan — click to place a room"
              onClick={handleFloorplanClick}
              className="max-w-full cursor-crosshair rounded-xl border border-border"
            />
            {tour.rooms.map((room) => (
              <span
                key={room.id}
                title={room.label || room.id}
                className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-accent/70"
                style={{ left: `${room.pos[0]}%`, top: `${room.pos[1]}%` }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {tour.rooms.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            allRooms={tour.rooms}
            mediaListId={mediaListId}
            onUpdate={(patch) => updateRoom(room.id, patch)}
            onDelete={() => deleteRoom(room.id)}
            onAddEdge={(toId) => addEdge(room.id, toId)}
            onRemoveEdge={(index) => removeEdge(room.id, index)}
            onUpdateEdgeClip={(index, clip) => updateEdgeClip(room.id, index, clip)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Export</h3>
          <div className="flex gap-2">
            <CopyButton text={json} />
            <button
              type="button"
              onClick={() => downloadJson(`${tour.slug || "tour"}.json`, json)}
              disabled={issues.length > 0}
              className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:border-accent/70 hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download tour.json
            </button>
          </div>
        </div>

        {issues.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 text-xs text-red-600 dark:text-red-400">
            {issues.map((issue) => (
              <li key={issue.message}>{issue.message}</li>
            ))}
          </ul>
        )}

        <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-background p-3 text-xs text-foreground">
          <code>{json}</code>
        </pre>
      </div>
    </div>
  );
}

interface RoomCardProps {
  room: TourRoom;
  allRooms: TourRoom[];
  mediaListId: string;
  onUpdate: (patch: Partial<TourRoom>) => void;
  onDelete: () => void;
  onAddEdge: (toId: string) => void;
  onRemoveEdge: (index: number) => void;
  onUpdateEdgeClip: (index: number, clip: string) => void;
}

function RoomCard({ room, allRooms, mediaListId, onUpdate, onDelete, onAddEdge, onRemoveEdge, onUpdateEdgeClip }: RoomCardProps) {
  const [pendingTarget, setPendingTarget] = useState("");
  const otherRooms = allRooms.filter((r) => r.id !== room.id);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <input
          value={room.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={room.id}
          aria-label={`Label for ${room.id}`}
          className="rounded-lg border border-border bg-background px-2 py-1 text-sm font-medium text-foreground"
        />
        <button type="button" onClick={onDelete} className="text-xs text-muted hover:text-red-500">
          Delete
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Still image (required)</span>
          <input
            list={mediaListId}
            value={room.still}
            onChange={(e) => onUpdate({ still: e.target.value })}
            placeholder="kitchen.jpg"
            className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Spin video (optional)</span>
          <input
            list={mediaListId}
            value={room.spin ?? ""}
            onChange={(e) => onUpdate({ spin: e.target.value || null })}
            placeholder="kitchen-spin.mp4"
            className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted">Doorways</span>
        {room.neighbors.map((edge, i) => (
          <div key={`${edge.to}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-foreground">→ {allRooms.find((r) => r.id === edge.to)?.label || edge.to}</span>
            <input
              list={mediaListId}
              value={edge.clip ?? ""}
              onChange={(e) => onUpdateEdgeClip(i, e.target.value)}
              placeholder="transition clip (or leave blank for a wipe)"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-foreground"
            />
            <button type="button" onClick={() => onRemoveEdge(i)} className="text-muted hover:text-red-500">
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <select
            value={pendingTarget}
            onChange={(e) => setPendingTarget(e.target.value)}
            aria-label={`Add doorway from ${room.label || room.id}`}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="">Add doorway to…</option>
            {otherRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label || r.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pendingTarget}
            onClick={() => {
              onAddEdge(pendingTarget);
              setPendingTarget("");
            }}
            className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
