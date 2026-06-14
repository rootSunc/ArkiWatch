import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RefreshErrorBanner } from "./data-platform-shell";
import { I18nProvider } from "./i18n";

describe("RefreshErrorBanner", () => {
  it("explains the failed refresh and lets the user dismiss it", () => {
    const onDismiss = vi.fn();

    render(
      <I18nProvider language="en">
        <RefreshErrorBanner
          error="Platform refresh job is not configured on the scheduler"
          language="en"
          onDismiss={onDismiss}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Refresh failed");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Platform refresh job is not configured on the scheduler",
    );

    screen.getByRole("button", { name: "Dismiss refresh error" }).click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("uses the selected language for the operational copy", () => {
    render(
      <I18nProvider language="zh">
        <RefreshErrorBanner
          error="刷新任务未配置"
          language="zh"
          onDismiss={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("刷新失败");
    expect(
      screen.getByRole("button", { name: "关闭刷新错误提示" }),
    ).toBeInTheDocument();
  });
});
