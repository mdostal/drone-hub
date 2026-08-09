// BDD specs for <FileUpload> in isolation. Covers generic-file-components'
// acceptance criteria: onFilesSelected fires with a plain File[] on both
// drop and click-to-browse selection, and — the scope-boundary check this
// whole story exists for — the component contains no network/storage/auth
// code of any kind (asserted directly against the source below, not just
// claimed).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FileUpload } from "./FileUpload";

function makeFile(name: string, type = "text/plain") {
  return new File(["contents"], name, { type });
}

describe("<FileUpload>", () => {
  it("Given files dropped onto the target, when dropped, then onFilesSelected fires with the dropped File[]", () => {
    const onFilesSelected = vi.fn();
    render(<FileUpload onFilesSelected={onFilesSelected} />);

    const target = screen.getByRole("button", { name: /drop files here/i });
    const file = makeFile("report.pdf", "application/pdf");
    fireEvent.drop(target, { dataTransfer: { files: [file] } });

    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    expect(onFilesSelected.mock.calls[0][0]).toEqual([file]);
  });

  it("Given a file chosen via the native file input, when selected, then onFilesSelected fires with the chosen File[]", () => {
    const onFilesSelected = vi.fn();
    render(<FileUpload onFilesSelected={onFilesSelected} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile("photo.png", "image/png");
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    expect(onFilesSelected.mock.calls[0][0]).toEqual([file]);
  });

  it("Given an empty drop (no files), when dropped, then onFilesSelected does not fire", () => {
    const onFilesSelected = vi.fn();
    render(<FileUpload onFilesSelected={onFilesSelected} />);

    const target = screen.getByRole("button", { name: /drop files here/i });
    fireEvent.drop(target, { dataTransfer: { files: [] } });

    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it("Given disabled, when clicked, then the native file picker is not opened", () => {
    render(<FileUpload onFilesSelected={vi.fn()} disabled />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: /drop files here/i }));

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("Given Enter is pressed on the focused target, when not disabled, then it opens the native file picker", () => {
    render(<FileUpload onFilesSelected={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});

    fireEvent.keyDown(screen.getByRole("button", { name: /drop files here/i }), { key: "Enter" });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  // Direct self-check of the scope-boundary constraint, not just a claim:
  // read the actual source and assert none of the network/storage/auth
  // CODE signals appear anywhere in it. Deliberately narrow patterns (not
  // a bare /auth/i) — this component's own comments legitimately discuss
  // the scope boundary in English prose ("no upload logic," "no auth of
  // any kind"), which a broad word-match would false-positive on.
  it("contains no fetch/XHR/storage-SDK/auth code — scope-boundary self-check", () => {
    const source = fs.readFileSync(path.join(__dirname, "FileUpload.tsx"), "utf-8");
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/@aws-sdk/);
    expect(source).not.toMatch(/getSession\(|signIn\(|cookies\(\)|Authorization['"]?\s*:/);
  });
});
