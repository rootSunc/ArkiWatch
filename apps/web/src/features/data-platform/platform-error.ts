type TranslateMessage = (key: string) => string;

/**
 * Convert transport/API failures into a small set of actionable, localized
 * messages. The raw error is intentionally not rendered directly: browser
 * fetch errors are usually English and rarely tell a public user what to do.
 */
export function platformErrorMessage(
  error: string | null | undefined,
  tKey: TranslateMessage,
): string {
  const normalized = error?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return tKey("shell.unknownPlatformError");
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("aborted")
  ) {
    return tKey("shell.apiTimeout");
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network error") ||
    normalized.includes("load failed") ||
    normalized.includes("unknown fetch failure")
  ) {
    return tKey("shell.apiUnavailable");
  }

  if (/(?:failed with|status)\s+(401|403)\b/.test(normalized)) {
    return tKey("shell.apiAccessDenied");
  }

  if (/(?:failed with|status)\s+(4\d{2})\b/.test(normalized)) {
    return tKey("shell.apiRequestFailed");
  }

  if (/(?:failed with|status)\s+(5\d{2})\b/.test(normalized)) {
    return tKey("shell.apiUnavailable");
  }

  if (normalized.includes("did not include data")) {
    return tKey("shell.apiIncompleteResponse");
  }

  return tKey("shell.unknownPlatformError");
}
