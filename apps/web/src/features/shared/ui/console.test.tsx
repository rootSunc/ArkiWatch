import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/features/data-platform/i18n";
import { EvidencePopover, MetricTile } from "./console";

function Reading() {
  const [value, setValue] = useState("16");
  return (
    <>
      <button type="button" onClick={() => setValue("18")}>
        change
      </button>
      <MetricTile label="Temperature" unit="°C" value={value} />
    </>
  );
}

describe("metric readings", () => {
  it("shows the first number without a second copy", () => {
    render(
      <I18nProvider language="en">
        <MetricTile label="Temperature" unit="°C" value="16" />
      </I18nProvider>,
    );

    expect(screen.getAllByText("16")).toHaveLength(1);
    expect(screen.getByText("16")).not.toHaveAttribute("aria-hidden");
  });

  it("cross-fades a changed number instead of jumping the layout", async () => {
    render(
      <I18nProvider language="en">
        <Reading />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "change" }));
    await waitFor(() => {
      expect(screen.getByText("16")).toHaveAttribute("aria-hidden", "true");
    });
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("16").parentElement).toBe(screen.getByText("18").parentElement);

    await act(() => new Promise((resolve) => setTimeout(resolve, 140)));
    expect(screen.queryByText("16")).not.toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });
});

describe("evidence popover", () => {
  it("references the popover only while it exists", () => {
    render(
      <I18nProvider language="en">
        <EvidencePopover evidence={{ provider: "FMI" }}>16</EvidencePopover>
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", { name: "View evidence" });
    expect(trigger).not.toHaveAttribute("aria-controls");

    fireEvent.click(trigger);
    const controls = trigger.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toBeInTheDocument();
  });
});
