import { afterEach, describe, expect, it, vi } from "vitest";

import { readPlatformActionError, waitForRefreshSettlement } from "./platform-actions";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("platform action errors", () => {
  it("preserves backend detail so refresh failures are actionable", async () => {
    const error = await readPlatformActionError(
      Response.json({ detail: "Scheduler is temporarily unavailable." }, { status: 503 }),
      "Fallback error",
    );

    expect(error.message).toBe("Scheduler is temporarily unavailable.");
  });

  it("falls back when the backend returns a non-JSON error", async () => {
    const error = await readPlatformActionError(
      new Response("upstream unavailable", { status: 502 }),
      "Fallback error",
    );

    expect(error.message).toBe("Fallback error");
  });

  it("cancels the status poll without waiting for the next interval", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ status: "running" }, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const pending = waitForRefreshSettlement(controller.signal);
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes the cancellation signal to status requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: "running" }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const pending = waitForRefreshSettlement(controller.signal);
    await Promise.resolve();
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: controller.signal }),
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
