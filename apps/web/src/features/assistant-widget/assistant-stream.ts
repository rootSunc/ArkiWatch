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
): string {
  if (errorMessage.includes("not configured") || errorMessage.includes("request failed")) {
    return tKey("assistant.providerUnavailable");
  }
  if (errorMessage.includes("stream interrupted")) {
    return tKey("assistant.streamInterrupted");
  }
  if (errorMessage.includes("returned no answer")) {
    return tKey("assistant.emptyResponse");
  }
  return errorMessage;
}
