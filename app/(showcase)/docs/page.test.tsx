import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DocsIntroductionPage from "./page";

describe("<DocsIntroductionPage>", () => {
  it("renders the Introduction heading", () => {
    render(<DocsIntroductionPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Introduction" })).toBeInTheDocument();
  });

  it("explains what the framework is, real vs synthetic data, and scope boundaries as real sections", () => {
    render(<DocsIntroductionPage />);
    expect(screen.getByRole("heading", { name: "Why this exists" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What's actually real here" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The stack" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Scope/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "License" })).toBeInTheDocument();
  });

  it("links back to the root component index and out to GitHub", () => {
    render(<DocsIntroductionPage />);
    expect(screen.getByRole("link", { name: /Back to the component index/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/mdostal/drone-hub",
    );
  });

  it("mentions MIT licensing explicitly", () => {
    render(<DocsIntroductionPage />);
    expect(screen.getByText(/MIT licensed/)).toBeInTheDocument();
  });
});
