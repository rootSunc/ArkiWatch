import { describe, expect, it } from "vitest";

import { localizeAssistantError, parseAssistantStream } from "./assistant-stream";

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
      "assistant.streamInterrupted": "回答中断",
      "assistant.emptyResponse": "没有回答",
    })[key] ?? key;

    expect(localizeAssistantError("AI provider request failed; grounded fallback answer used.", tKey))
      .toBe("服务不可用");
    expect(localizeAssistantError("AI provider stream interrupted; the answer may be incomplete.", tKey))
      .toBe("回答中断");
    expect(localizeAssistantError("an unknown issue", tKey)).toBe("an unknown issue");
  });
});
