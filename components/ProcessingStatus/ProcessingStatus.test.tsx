// BDD specs for <ProcessingStatus> in isolation. Covers generic-file-components'
// acceptance criteria: it's presentational only (renders exactly the status/
// progress it's handed, no internal polling), plus the scope-boundary
// self-check.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProcessingStatus, clampProgress } from "./ProcessingStatus";

describe("<ProcessingStatus>", () => {
  it.each(["queued", "processing", "done", "error"] as const)(
    "Given status=%s, when rendered, then it shows the matching status text",
    (status) => {
      render(<ProcessingStatus status={status} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    },
  );

  it("Given status='processing' and a progress fraction, when rendered, then it shows a percentage and a proportionally-widthed bar", () => {
    render(<ProcessingStatus status="processing" progress={0.42} />);
    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  it("Given status='done', when rendered, then no progress bar or percentage renders even if progress is passed", () => {
    render(<ProcessingStatus status="done" progress={0.9} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("Given a label prop, when rendered, then it's shown alongside the status", () => {
    render(<ProcessingStatus status="queued" label="site-survey.pdf" />);
    expect(screen.getByText("site-survey.pdf")).toBeInTheDocument();
  });

  it("Given the same status prop across re-renders, when no new render occurs, then it never changes on its own (no internal timers)", async () => {
    render(<ProcessingStatus status="processing" progress={0.1} />);
    expect(screen.getByText(/10%/)).toBeInTheDocument();
    // Wait a beat — if this component had an internal auto-advance timer,
    // this would catch it changing without a prop update.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText(/10%/)).toBeInTheDocument();
  });
});

describe("clampProgress", () => {
  it.each([
    [0.5, 0.5],
    [-0.2, 0],
    [1.4, 1],
    [0, 0],
    [1, 1],
  ])("Given %d, when clamped, then it returns %d", (input, expected) => {
    expect(clampProgress(input)).toBe(expected);
  });

  it("Given NaN, when clamped, then it returns 0 rather than propagating NaN", () => {
    expect(clampProgress(Number.NaN)).toBe(0);
  });
});

describe("scope-boundary self-check", () => {
  it("contains no fetch/XHR/websocket/storage-SDK/auth/timer-polling code", () => {
    const source = fs.readFileSync(path.join(__dirname, "ProcessingStatus.tsx"), "utf-8");
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/WebSocket/);
    expect(source).not.toMatch(/@aws-sdk/);
    expect(source).not.toMatch(/setInterval|setTimeout/);
    expect(source).not.toMatch(/getSession\(|signIn\(|cookies\(\)|Authorization['"]?\s*:/);
  });
});
