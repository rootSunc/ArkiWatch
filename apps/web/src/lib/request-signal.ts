/**
 * Combine a caller-owned cancellation signal with a bounded request budget.
 *
 * This is shared by server proxies and browser data clients so cancellation
 * never comes at the cost of losing the timeout guard.
 */
export function requestSignalWithTimeout(
  incomingSignal: AbortSignal,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([incomingSignal, timeoutSignal]);
  }

  const controller = new AbortController();
  const abortFromIncomingRequest = () => {
    controller.abort(incomingSignal.reason);
  };

  if (incomingSignal.aborted) {
    abortFromIncomingRequest();
  } else {
    incomingSignal.addEventListener("abort", abortFromIncomingRequest, { once: true });
  }

  timeoutSignal.addEventListener(
    "abort",
    () => controller.abort(timeoutSignal.reason),
    { once: true },
  );

  return controller.signal;
}
