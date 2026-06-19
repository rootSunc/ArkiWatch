export type AssistantApiCitation = {
  source: string;
  checked_at: string | null;
  detail: string;
};

export type AssistantStreamPayload = {
  content?: string;
  message?: string;
  citations?: AssistantApiCitation[];
  model?: string | null;
  answer_mode?: "deepseek" | "fallback";
  error_message?: string | null;
  answer?: string;
};

export type AssistantStreamEvent = {
  event: string;
  data: AssistantStreamPayload;
};

export type AssistantErrorDetails = {
  message: string;
  retryAfterSeconds: number | null;
};

// AI generation can legitimately take longer than ordinary platform reads,
// but a stalled stream must still return control to the user.
export const ASSISTANT_REQUEST_TIMEOUT_MS = 45_000;

export function parseRetryAfter(value: string | null): number | null {
  const normalized = value?.trim() ?? "";
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const seconds = Number(normalized);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

export async function readAssistantError(
  response: Response,
): Promise<AssistantErrorDetails> {
  const payload = (await response.json().catch(() => null)) as {
    detail?: unknown;
    message?: unknown;
  } | null;
  const detail =
    typeof payload?.detail === "string"
      ? payload.detail
      : typeof payload?.message === "string"
        ? payload.message
        : `Assistant request failed with ${response.status}.`;

  return {
    message: detail,
    retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
  };
}

export function parseAssistantStream(
  buffer: string,
): { events: AssistantStreamEvent[]; remainder: string } {
  const normalizedBuffer = buffer.replace(/\r\n/g, "\n");
  const parts = normalizedBuffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const events = parts
    .map((part) => {
      const lines = part.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLines = lines.filter((line) => line.startsWith("data:"));
      if (!dataLines.length) {
        return null;
      }

      try {
        return {
          event: eventLine?.replace("event:", "").trim() || "message",
          data: JSON.parse(
            dataLines.map((line) => line.replace("data:", "").trimStart()).join("\n"),
          ) as AssistantStreamPayload,
        };
      } catch {
        return null;
      }
    })
    .filter((event): event is AssistantStreamEvent => event !== null);

  return { events, remainder };
}

export function localizeAssistantError(
  errorMessage: string,
  tKey: (key: string) => string,
  retryAfterSeconds: number | null = null,
): string {
  const normalizedMessage = errorMessage.toLowerCase();
  if (
    normalizedMessage.includes("request limit") ||
    normalizedMessage.includes("rate limit")
  ) {
    const key = retryAfterSeconds === null
      ? "assistant.rateLimitedSoon"
      : "assistant.rateLimited";
    return tKey(key).replace("{seconds}", String(retryAfterSeconds ?? ""));
  }
  if (
    normalizedMessage.includes("not configured") ||
    normalizedMessage.includes("request failed") ||
    normalizedMessage.includes("provider unavailable") ||
    normalizedMessage.includes("backend unavailable") ||
    normalizedMessage.includes("service unavailable")
  ) {
    return tKey("assistant.providerUnavailable");
  }
  if (normalizedMessage.includes("stream interrupted")) {
    return tKey("assistant.streamInterrupted");
  }
  if (normalizedMessage.includes("timed out") || normalizedMessage.includes("timeout")) {
    return tKey("assistant.timedOut");
  }
  if (normalizedMessage.includes("returned no answer")) {
    return tKey("assistant.emptyResponse");
  }
  return tKey("assistant.failure");
}
