import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantRetryButton } from "./assistant-retry-button";
import { AssistantWidget } from "./assistant-widget";
import { I18nProvider } from "@/features/data-platform/i18n";

describe("AssistantRetryButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
          showLauncher={false}
          userId=""
        />
      </I18nProvider>,
    );

    const input = await screen.findByRole("textbox", { name: "Ask about platform data" });
    await waitFor(() => {
      expect(input).toHaveValue("Explain my personal recommendations.");
    });
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
          overview={null}
          userId=""
        />
      </I18nProvider>,
    );

    screen.getByRole("button", { name: "Open ArkiWatch assistant" }).click();
    const input = await screen.findByRole("textbox", { name: "Ask about platform data" });
    fireEvent.change(input, { target: { value: "What should I do?" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(
      await screen.findByText("The assistant is busy. Try again in 17 seconds."),
    ).toBeInTheDocument();
  });
});
