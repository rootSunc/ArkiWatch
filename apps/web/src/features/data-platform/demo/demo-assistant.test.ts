import { describe, expect, it } from "vitest";

import { demoAssistantReply } from "./demo-assistant";

describe("demo assistant", () => {
  it("answers the current snapshot without a network request", () => {
    const reply = demoAssistantReply("Explain the current page's data", "en");

    expect(reply.text).toContain("16 °C");
    expect(reply.text).toContain("7.80 c/kWh");
    expect(reply.answerMode).toBe("fallback");
    expect(reply.citations[0]?.source).toBe("Static demo fixture");
  });

  it("keeps topic answers localized", () => {
    const reply = demoAssistantReply("哪个数据源最近异常？", "zh");

    expect(reply.text).toContain("不会访问任何后端");
    expect(reply.text).toContain("FMI");
  });
});
