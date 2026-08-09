// BDD specs for <FileList> in isolation. Covers generic-file-components'
// acceptance criteria: given already-resolved URLs, it renders plain
// <a href download> elements (not next/link) and performs no basePath
// resolution internally — plus the scope-boundary self-check.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileList } from "./FileList";
import type { FileEntry } from "@/lib/file-types";

const SAMPLE_FILES: FileEntry[] = [
  { name: "Notes.txt", url: "/file-list-samples/sample-notes.txt", sizeBytes: 231, contentType: "text/plain" },
  {
    name: "Manifest.json",
    url: "/file-list-samples/sample-manifest.json",
    sizeBytes: 177,
    contentType: "application/json",
  },
];

describe("<FileList>", () => {
  it("Given a manifest of files, when rendered, then each renders a download link with its exact already-resolved href", () => {
    render(<FileList files={SAMPLE_FILES} />);

    const links = screen.getAllByRole("link", { name: "Download" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/file-list-samples/sample-notes.txt");
    expect(links[1]).toHaveAttribute("href", "/file-list-samples/sample-manifest.json");
  });

  it("Given a manifest, when rendered, then every link is a real <a download> element, not a next/link client-nav anchor missing the download attribute", () => {
    render(<FileList files={SAMPLE_FILES} />);
    for (const link of screen.getAllByRole("link", { name: "Download" })) {
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("download");
    }
  });

  it("Given files with different content types, when rendered, then each shows a category label (PDF/JSON/Text/etc)", () => {
    render(<FileList files={SAMPLE_FILES} />);
    expect(screen.getByText(/Text ·/)).toBeInTheDocument();
    expect(screen.getByText(/JSON ·/)).toBeInTheDocument();
  });

  it("Given an empty files array, when rendered, then it shows a 'No files.' message rather than an empty list", () => {
    render(<FileList files={[]} />);
    expect(screen.getByText("No files.")).toBeInTheDocument();
  });

  // Direct self-check of the scope-boundary constraint: the source must
  // never IMPORT lib/base-path.ts's withBasePath (it's fine — expected —
  // for the header comment to discuss the rule by name in prose; checking
  // for the actual import is what proves it's never callable here, not
  // just absent-by-coincidence) and must never render via next/link — both
  // are explicitly prohibited for this portable component, per
  // lib/base-path.ts's own header comment.
  it("never imports withBasePath or next/link — scope-boundary self-check", () => {
    const source = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf-8");
    expect(source).not.toMatch(/from ["']@\/lib\/base-path["']/);
    expect(source).not.toMatch(/from ["']next\/link["']/);
  });

  it("contains no fetch/XHR/storage-SDK/auth code — scope-boundary self-check", () => {
    const source = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf-8");
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/@aws-sdk/);
    expect(source).not.toMatch(/getSession\(|signIn\(|cookies\(\)|Authorization['"]?\s*:/);
  });
});
