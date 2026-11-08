import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import { PlanWorkspace } from "./plan-workspace";

const props = {
  brief: null,
  error: null,
  onEditContext: vi.fn(),
  onOpenAssistant: vi.fn(),
  onOpenEvent: vi.fn(),
  onOpenScenario: vi.fn(),
  onRetry: vi.fn(),
  personal: null,
};

describe("PlanWorkspace", () => {
  it("does not claim a saved context before one exists", () => {
    render(
      <I18nProvider language="en">
        <PlanWorkspace {...props} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Your day" })).toBeInTheDocument();
    expect(screen.queryByText("Based on saved context")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit context" })).toBeInTheDocument();
    expect(screen.getByText("Build your day around your context")).toBeInTheDocument();
  });
});
