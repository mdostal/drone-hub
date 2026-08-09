import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TourBuilder } from "./TourBuilder";
import type { Tour } from "@/lib/tour-types";

// jsdom doesn't implement these -- stub them so floorplan-image preview and
// export-to-file both work under test.
beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });
});

function makeFile(name: string, type: string) {
  return new File(["content"], name, { type });
}

function uploadFloorplan() {
  const input = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [makeFile("floorplan.png", "image/png")] } });
}

function stubFloorplanRect() {
  const img = screen.getByAltText("Floorplan — click to place a room");
  img.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  return img;
}

describe("<TourBuilder>", () => {
  it("Given a blank builder, when rendered, then export is blocked by real validation issues", () => {
    render(<TourBuilder />);
    expect(screen.getByText("Slug is required.")).toBeInTheDocument();
    expect(screen.getByText("Add at least one room (click the floorplan to place one).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download tour.json" })).toBeDisabled();
  });

  it("Given an uploaded floorplan, when clicked, then a new room is placed and becomes the start room", () => {
    render(<TourBuilder />);
    uploadFloorplan();
    const img = stubFloorplanRect();

    fireEvent.click(img, { clientX: 100, clientY: 50 });

    expect(screen.getByPlaceholderText("room-1")).toBeInTheDocument();
    const startRoomSelect = screen.getByLabelText("Start room") as HTMLSelectElement;
    expect(startRoomSelect.value).toBe("room-1");
  });

  it("Given two rooms with labels and stills, when a doorway is added between them, then the exported JSON has a real edge", () => {
    render(<TourBuilder />);
    uploadFloorplan();
    const img = stubFloorplanRect();

    fireEvent.click(img, { clientX: 10, clientY: 10 });
    fireEvent.click(img, { clientX: 190, clientY: 90 });

    fireEvent.change(screen.getByPlaceholderText("2806-prado"), { target: { value: "demo" } });
    fireEvent.change(screen.getByPlaceholderText("2806 Prado"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByPlaceholderText("room-1"), { target: { value: "Entry" } });
    fireEvent.change(screen.getByPlaceholderText("room-2"), { target: { value: "Living Room" } });

    const stillInputs = screen.getAllByPlaceholderText("kitchen.jpg");
    fireEvent.change(stillInputs[0], { target: { value: "entry.jpg" } });
    fireEvent.change(stillInputs[1], { target: { value: "living.jpg" } });

    fireEvent.change(screen.getByLabelText("Add doorway from Entry"), { target: { value: "room-2" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);

    expect(screen.getByText("→ Living Room")).toBeInTheDocument();

    const clipInput = screen.getByPlaceholderText("transition clip (or leave blank for a wipe)");
    fireEvent.change(clipInput, { target: { value: "entry-to-living.mp4" } });

    const pre = screen.getByText(/"slug"/);
    const tour = JSON.parse(pre.textContent ?? "{}") as Tour;
    expect(tour.rooms).toHaveLength(2);
    const entry = tour.rooms.find((r) => r.label === "Entry");
    expect(entry?.neighbors).toEqual([{ to: "room-2", clip: "entry-to-living.mp4" }]);
    expect(screen.getByRole("button", { name: "Download tour.json" })).toBeEnabled();
  });

  it("Given uploaded media files, when added, then the media pool is offered via a shared datalist", () => {
    render(<TourBuilder />);
    const mediaInput = document.querySelector('input[type="file"][accept="video/*,image/*"]') as HTMLInputElement;
    fireEvent.change(mediaInput, {
      target: { files: [makeFile("kitchen.jpg", "image/jpeg"), makeFile("kitchen-spin.mp4", "video/mp4")] },
    });

    expect(screen.getByText("Media pool (2 files)")).toBeInTheDocument();
    const options = document.querySelectorAll("datalist option");
    const values = Array.from(options).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["kitchen.jpg", "kitchen-spin.mp4"]);
  });

  it("Given a room, when deleted, then any doorways pointing at it from other rooms are also removed", () => {
    render(<TourBuilder />);
    uploadFloorplan();
    const img = stubFloorplanRect();

    fireEvent.click(img, { clientX: 10, clientY: 10 });
    fireEvent.click(img, { clientX: 190, clientY: 90 });

    fireEvent.change(screen.getByLabelText("Add doorway from room-1"), { target: { value: "room-2" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    expect(screen.getByText("→ room-2")).toBeInTheDocument();

    const room2Card = screen.getByPlaceholderText("room-2").closest("div.rounded-xl") as HTMLElement;
    fireEvent.click(within(room2Card).getByRole("button", { name: "Delete" }));

    expect(screen.queryByText("→ room-2")).not.toBeInTheDocument();
    const pre = screen.getByText(/"slug"/);
    const tour = JSON.parse(pre.textContent ?? "{}") as Tour;
    expect(tour.rooms).toHaveLength(1);
  });
});
