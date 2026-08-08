// Global test setup, loaded once per test file via vitest.config.mts's
// `test.setupFiles`. Registers @testing-library/jest-dom's matchers
// (toBeInTheDocument, toBeDisabled, etc.) so specs can assert against the
// DOM in plain, readable terms instead of raw attribute checks.
import "@testing-library/jest-dom/vitest";

// Auto-unmount + clean up the DOM between tests (React Testing Library
// doesn't do this on its own outside of Jest's global afterEach hook).
// Centralized here so individual spec files don't each need their own
// `afterEach(() => cleanup())`.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
