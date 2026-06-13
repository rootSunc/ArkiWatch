import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "./share-view-link-button";

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
});
