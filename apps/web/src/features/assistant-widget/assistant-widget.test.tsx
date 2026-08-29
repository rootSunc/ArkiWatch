import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantRetryButton } from "./assistant-retry-button";
import { AssistantWidget } from "./assistant-widget";
import { ASSISTANT_REQUEST_TIMEOUT_MS } from "./assistant-stream";
import { I18nProvider } from "@/features/data-platform/i18n";
import type { PlatformOverviewResponse } from "@/features/data-platform/types";

describe("AssistantRetryButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("exposes a localized retry action", () => {
    const onRetry = vi.fn();

    render(
      <I18nProvider language="en">
        <AssistantRetryButton language="en" onRetry={onRetry} />
      </I18nProvider>,
    );

    const button = screen.getByRole("button", { name: "Retry assistant request" });
    expect(button).toHaveTextContent("Try again");

    button.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps the retry action accessible in Chinese", () => {
    render(
      <I18nProvider language="zh">
        <AssistantRetryButton language="zh" onRetry={vi.fn()} />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("button", { name: "重试助手请求" }),
    ).toHaveTextContent("再试一次");
  });

  it("prefills a contextual question when another surface opens the assistant", async () => {
    render(
      <I18nProvider language="en">
        <AssistantWidget
          city="helsinki"
          date={null}
          language="en"
          mode="today"
          openQuestion="Explain my personal recommendations."
          openRequest={1}
          overview={null}
          userId=""
        />
      </I18nProvider>,
    );

    const input = await screen.findByRole("textbox", { name: "Ask about platform data" });
    await waitFor(() => {
      expect(input).toHaveValue("Explain my personal recommendations.");
    });
  });

  it("keeps the draft question when background data refreshes", async () => {
    const renderWidget = (checkedAt: string) => (
      <I18nProvider language="en">
        <AssistantWidget
          city="helsinki"
          date={null}
          language="en"
          mode="today"
          openQuestion="Keep this question"
          openRequest={1}
          overview={{ checked_at: checkedAt } as PlatformOverviewResponse}
          userId=""
        />
      </I18nProvider>
    );

    const view = render(renderWidget("2026-08-11T07:00:00Z"));
    expect(await screen.findByRole("textbox", { name: "Ask about platform data" })).toHaveValue(
      "Keep this question",
    );

    view.rerender(renderWidget("2026-08-11T07:05:00Z"));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Ask about platform data" })).toHaveValue(
        "Keep this question",
      );
    });
  });

  it("pauses while the platform scope is updating", async () => {
    const renderWidget = (scopePending: boolean, openRequest?: number) => (
      <I18nProvider language="en">
        <AssistantWidget
          city="helsinki"
          date={null}
          language="en"
          mode="today"
          openRequest={openRequest}
          overview={null}
          scopePending={scopePending}
          userId=""
        />
      </I18nProvider>
    );

    const view = render(renderWidget(false, 1));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    view.rerender(renderWidget(true, 1));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    view.rerender(renderWidget(false, 1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses evidence-only copy and prompts for a historical Today scope", async () => {
    render(
      <I18nProvider language="en">
        <AssistantWidget
          city="helsinki"
          date="2026-08-09"
          language="en"
          mode="today"
          openRequest={1}
          overview={null}
          userId=""
        />
      </I18nProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Historical assistant" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Historical · evidence only")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "What mattered most on the selected date?" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "What should I pay attention to today?" }),
    ).not.toBeInTheDocument();
  });

  it("shows the platform coverage area instead of implying city-only evidence", async () => {
    render(
      <I18nProvider language="en">
        <AssistantWidget
          city="tampere"
          date={null}
          language="en"
          mode="today"
          openRequest={1}
          overview={{ coverage_area: "Tampere / Pirkanmaa" } as PlatformOverviewResponse}
          userId=""
        />
      </I18nProvider>,
    );

    expect(await screen.findByText("Tampere / Pirkanmaa")).toBeInTheDocument();
    expect(screen.queryByText("Tampere", { exact: true })).not.toBeInTheDocument();
  });

  it("shows a localized wait time when the assistant is rate limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Assistant request limit reached." }), {
          headers: {
            "content-type": "application/json",
            "retry-after": "17",
          },
          status: 429,
        }),
      ),
    );

    render(
      <I18nProvider language="en">
        <AssistantWidget
          city="helsinki"
          date={null}
          language="en"
          mode="today"
          openRequest={1}
          overview={null}
          userId=""
        />
      </I18nProvider>,
    );

    const input = await screen.findByRole("textbox", { name: "Ask about platform data" });
    fireEvent.change(input, { target: { value: "What should I do?" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(
      await screen.findByText("The assistant is busy. Try again in 17 seconds."),
    ).toBeInTheDocument();
  });

  it("returns a retryable, localized state when a stream stalls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The request timed out.", "AbortError"));
          }, { once: true });
        }),
      ),
    );

    render(
      <I18nProvider language="en">
        <AssistantWidget
          city="helsinki"
          date={null}
          language="en"
          mode="today"
          openRequest={1}
          overview={null}
          userId=""
        />
      </I18nProvider>,
    );

    const input = screen.getByRole("textbox", { name: "Ask about platform data" });
    fireEvent.change(input, { target: { value: "What should I do?" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await act(async () => {
      vi.advanceTimersByTime(ASSISTANT_REQUEST_TIMEOUT_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText("The assistant took too long to respond. Try again or inspect the cited data."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry assistant request" })).toBeInTheDocument();
  });
});
