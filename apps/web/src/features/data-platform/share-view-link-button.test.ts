import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard, ShareViewLinkButton } from "./share-view-link-button";

describe("copyTextToClipboard", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "execCommand");
    vi.restoreAllMocks();
  });

  it("uses the async clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await copyTextToClipboard("https://example.test/view");

    expect(writeText).toHaveBeenCalledWith("https://example.test/view");
  });

  it("falls back to execCommand and removes its temporary textarea", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await copyTextToClipboard("https://example.test/view");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("restores focus after the legacy copy path", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    await copyTextToClipboard("https://example.test/view");

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("reports a rejected legacy copy instead of claiming success", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });

    await expect(copyTextToClipboard("https://example.test/view")).rejects.toThrow(
      "Clipboard copy command was rejected",
    );
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("announces a copy failure when the button state changes", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });

    render(createElement(ShareViewLinkButton, { language: "en" }));

    fireEvent.click(screen.getByRole("button", { name: "Copy view link" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Could not copy link");
    expect(screen.getByRole("button", { name: "Could not copy link" })).toBeInTheDocument();
  });
});
