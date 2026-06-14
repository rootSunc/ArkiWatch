import { describe, expect, it } from "vitest";

import {
  localizeAssistantError,
  parseRetryAfter,
  parseAssistantStream,
  readAssistantError,
} from "./assistant-stream";

describe("assistant stream protocol", () => {
  it("keeps incomplete SSE frames for the next network chunk", () => {
    const parsed = parseAssistantStream(
      'event: token\ndata: {"content":"Use "}\n\n' +
        'event: done\ndata: {"answer":"Use an umbrella."}',
    );

    expect(parsed.events).toEqual([
      { event: "token", data: { content: "Use " } },
    ]);
    expect(parsed.remainder).toContain("event: done");
  });

  it("maps known provider failures to localized, actionable copy", () => {
    const tKey = (key: string) => ({
      "assistant.providerUnavailable": "服务不可用",
      "assistant.rateLimited": "请在 {seconds} 秒后重试",
      "assistant.rateLimitedSoon": "请稍后重试",
      "assistant.streamInterrupted": "回答中断",
      "assistant.emptyResponse": "没有回答",
    })[key] ?? key;

    expect(localizeAssistantError("AI provider request failed; grounded fallback answer used.", tKey))
      .toBe("服务不可用");
    expect(localizeAssistantError("AI provider stream interrupted; the answer may be incomplete.", tKey))
      .toBe("回答中断");
    expect(localizeAssistantError("Assistant request limit reached.", tKey, 17))
      .toBe("请在 17 秒后重试");
    expect(localizeAssistantError("Assistant request limit reached.", tKey))
      .toBe("请稍后重试");
    expect(localizeAssistantError("an unknown issue", tKey)).toBe("an unknown issue");
  });

  it("parses only non-negative numeric retry guidance", () => {
    expect(parseRetryAfter("17")).toBe(17);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("-1")).toBeNull();
    expect(parseRetryAfter("17seconds")).toBeNull();
    expect(parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT")).toBeNull();
  });

  it("reads a structured backend error and retry header", async () => {
    const response = new Response(
      JSON.stringify({ detail: "Assistant request limit reached." }),
      { headers: { "retry-after": "17" }, status: 429 },
    );

    await expect(readAssistantError(response)).resolves.toEqual({
      message: "Assistant request limit reached.",
      retryAfterSeconds: 17,
    });
  });
});
