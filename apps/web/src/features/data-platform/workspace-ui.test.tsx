import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceEmptyState, WorkspaceEvidenceHeader } from "./workspace-ui";

describe("WorkspaceEvidenceHeader", () => {
  it("keeps source and scoped timestamp adjacent", () => {
    render(
      <WorkspaceEvidenceHeader
        fallbackKey="shell.notCollected"
        language="en"
        observedAt="2026-08-12T09:30:00Z"
        sourceLabel="FMI"
        status="Live"
        statusTone="good"
        tKey={(key) => (key === "shell.notCollected" ? "Not collected" : key)}
        timeScope={{
          mode: "live",
          date: null,
          timezone: "Europe/Helsinki",
          reference_time: "2026-08-12T09:30:00Z",
          window_start: null,
          window_end: null,
        }}
        title="Weather"
      />,
    );

    expect(screen.getByRole("heading", { name: "Weather" })).toBeInTheDocument();
    expect(screen.getByText("FMI")).toBeInTheDocument();
    expect(screen.getByText(/2026|09:30|12 Aug/)).toBeInTheDocument();
  });
});
describe("WorkspaceEmptyState", () => {
  it("renders a semantic heading and description", () => {
    render(
      <WorkspaceEmptyState
        description="The source has not returned a usable snapshot."
        eyebrow="Weather"
        title="No current data"
      />,
    );

    expect(screen.getByRole("heading", { name: "No current data" })).toBeInTheDocument();
    expect(screen.getByText("The source has not returned a usable snapshot.")).toBeInTheDocument();
  });
});
