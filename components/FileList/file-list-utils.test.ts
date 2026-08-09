import { describe, expect, it } from "vitest";
import { categorizeContentType, categoryLabel, formatBytes } from "./file-list-utils";

describe("categorizeContentType", () => {
  it.each([
    ["image/png", "image"],
    ["application/pdf", "pdf"],
    ["video/mp4", "video"],
    ["audio/mpeg", "audio"],
    ["application/json", "json"],
    ["text/plain", "text"],
    ["application/zip", "archive"],
    ["application/octet-stream", "other"],
  ] as const)("Given contentType %s, when categorized, then it returns %s", (contentType, expected) => {
    expect(categorizeContentType(contentType)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(categorizeContentType("IMAGE/PNG")).toBe("image");
  });
});

describe("categoryLabel", () => {
  it("returns a human-readable label per category", () => {
    expect(categoryLabel("pdf")).toBe("PDF");
    expect(categoryLabel("other")).toBe("File");
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [1024 * 1024, "1.0 MB"],
    [1024 * 1024 * 2.5, "2.5 MB"],
  ])("Given %d bytes, when formatted, then it renders %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("Given a negative or non-finite value, when formatted, then it renders a placeholder rather than throwing", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
});
