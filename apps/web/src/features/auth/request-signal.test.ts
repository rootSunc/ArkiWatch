import { afterEach, describe, expect, it, vi } from "vitest";

import { requestSignalWithTimeout } from "./request-signal";

describe("requestSignalWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("propagates cancellation from the incoming request", () => {
    const incomingController = new AbortController();
    const signal = requestSignalWithTimeout(incomingController.signal, 1000);

    expect(signal.aborted).toBe(false);
    incomingController.abort(new DOMException("Request closed", "AbortError"));

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(DOMException);
    expect(signal.reason.name).toBe("AbortError");
  });

  it("aborts when the server-side timeout expires", () => {
    const timeoutController = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutController.signal);
    const signal = requestSignalWithTimeout(new AbortController().signal, 1000);

    expect(timeoutSpy).toHaveBeenCalledWith(1000);
    timeoutController.abort(new DOMException("Timed out", "TimeoutError"));

    expect(signal.aborted).toBe(true);
    expect(signal.reason?.name).toBe("TimeoutError");
  });
});
