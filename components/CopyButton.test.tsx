// BDD specs for <CopyButton> in isolation. Covers
// site-nav-and-copy-buttons.yaml's clipboard acceptance criteria — actual
// end-to-end "did the real clipboard receive the real text" behavior is
// verified separately via Playwright (jsdom has no real Clipboard API), but
// the Promise-rejection-safety contract (no unhandled rejection) is a unit
// concern this file owns.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CopyButton } from "./CopyButton";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  // @ts-expect-error -- test-only teardown of the stubbed property.
  delete navigator.clipboard;
  vi.restoreAllMocks();
});

describe("<CopyButton>", () => {
  it("Given a click, when navigator.clipboard.writeText resolves, then it is called with the exact text prop", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<CopyButton text="const x = 1;" />);
    fireEvent.click(screen.getByRole("button"));

    expect(writeText).toHaveBeenCalledWith("const x = 1;");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("Given navigator.clipboard.writeText rejects, when clicked, then no unhandled promise rejection occurs and the button shows a failure state", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const writeText = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    stubClipboard(writeText);

    render(<CopyButton text="const x = 1;" />);
    fireEvent.click(screen.getByRole("button"));

    expect(await screen.findByRole("button", { name: "Couldn't copy" })).toBeInTheDocument();
    // Give the microtask queue a tick to surface any unhandled rejection
    // before asserting none fired.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unhandled).not.toHaveBeenCalled();

    process.off("unhandledRejection", unhandled);
  });

  it("renders idle state as 'Copy' before any interaction", () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CopyButton text="anything" />);
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});
