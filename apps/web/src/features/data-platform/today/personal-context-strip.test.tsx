import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n";
import type { PersonalDashboardRead } from "../personal/personal-dashboard";
import { PersonalContextStrip } from "./personal-context-strip";

const dashboard = {
  onboarding_completion_percent: 60,
  workflow_steps: [
    {
      key: "location",
      title: "Set default location",
      status: "action_required",
      detail: "Missing",
    },
  ],
} as PersonalDashboardRead;

describe("PersonalContextStrip", () => {
  it("surfaces the next setup step without expanding Today into a settings page", () => {
    render(
      <I18nProvider language="zh">
        <PersonalContextStrip dashboard={dashboard} onOpenAssistant={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getByText("已准备 60%")).toBeInTheDocument();
    expect(screen.getByText("下一步：设置默认位置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "询问助手" })).toBeInTheDocument();
    expect(document.querySelector(".today-personal-context .assistant-glyph")).toBeInTheDocument();
  });

  it("offers the dedicated setup flow when the host provides it", async () => {
    const onOpenSettings = vi.fn();
    render(
      <I18nProvider language="zh">
        <PersonalContextStrip
          dashboard={dashboard}
          onOpenAssistant={vi.fn()}
          onOpenSettings={onOpenSettings}
        />
      </I18nProvider>,
    );

    const button = screen.getByRole("button", { name: "完善设置" });
    button.click();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("opens the assistant without forwarding the click event when setup is complete", () => {
    const onOpenAssistant = vi.fn();

    render(
      <I18nProvider language="en">
        <PersonalContextStrip
          dashboard={
            {
              onboarding_completion_percent: 100,
              workflow_steps: [],
            }
          }
          onOpenAssistant={onOpenAssistant}
        />
      </I18nProvider>,
    );

    screen.getByRole("button", { name: "Ask assistant" }).click();
    expect(onOpenAssistant).toHaveBeenCalledWith();
  });
});
