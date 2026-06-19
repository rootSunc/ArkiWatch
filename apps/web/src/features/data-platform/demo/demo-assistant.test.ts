import { describe, expect, it } from "vitest";

import { demoAssistantReply } from "./demo-assistant";

describe("demo assistant", () => {
  it("answers the current snapshot without a network request", () => {
    const reply = demoAssistantReply("Explain the current page's data", "en");

    expect(reply.text).toContain("16 °C");
    expect(reply.text).toContain("9.60 c/kWh");
    expect(reply.text).toContain("7.80 c/kWh");
    expect(reply.answerMode).toBe("fallback");
    expect(reply.citations[0]?.source).toBe("Static demo fixture");
  });

  it("keeps topic answers localized", () => {
    const reply = demoAssistantReply("哪个数据源最近异常？", "zh");

    expect(reply.text).toContain("不会访问任何后端");
    expect(reply.text).toContain("FMI");
    expect(reply.text).not.toMatch(/\b(?:Demo|fixture|live)\b/i);
  });

  it("keeps the Chinese snapshot answer free of English UI copy", () => {
    const reply = demoAssistantReply("今天有什么需要留意？", "zh");

    expect(reply.text).toContain("演示快照");
    expect(reply.text).toContain("今日");
    expect(reply.text).not.toMatch(/\b(?:Demo|Good|Today|fixture|live)\b/i);
  });

  it("distinguishes the current price from the flexible-use window", () => {
    const reply = demoAssistantReply("When is electricity cheaper?", "en");

    expect(reply.text).toContain("current household electricity window of 9.60 c/kWh");
    expect(reply.text).toContain("lower-cost flexible-use window");
    expect(reply.text).toContain("7.80 c/kWh");
  });

  it("does not answer an unavailable historical date from the live demo snapshot", () => {
    const reply = demoAssistantReply("What should I pay attention to?", "en", {
      date: "2026-08-07",
    });

    expect(reply.text).toContain("There is no demo data for the selected date (2026-08-07)");
    expect(reply.text).toContain("will not use the 2026-08-08 snapshot as a substitute");
    expect(reply.text).not.toContain("16 °C");
    expect(reply.text).not.toContain("9.60 c/kWh");
    expect(reply.citations[0]?.detail).toContain("no demo data for 2026-08-07");
  });

  it("labels an available historical snapshot as evidence and keeps the city in scope", () => {
    const reply = demoAssistantReply("When is electricity cheaper?", "en", {
      city: "helsinki",
      date: "2026-08-08",
    });

    expect(reply.text).toContain("historical demo snapshot for Helsinki on 2026-08-08");
    expect(reply.text).toContain("Do not use it to plan today’s laundry or dishes");
    expect(reply.citations[0]?.detail).toBe("Helsinki historical snapshot · 2026-08-08");
  });

  it("does not relabel the Helsinki demo snapshot for another city", () => {
    const reply = demoAssistantReply("What should I pay attention to?", "en", {
      city: "tampere",
    });

    expect(reply.text).toContain("covers Helsinki / Uusimaa only");
    expect(reply.text).not.toContain("16 °C");
    expect(reply.text).not.toContain("9.60 c/kWh");
    expect(reply.citations[0]?.detail).toBe("Tampere · demo coverage is Helsinki / Uusimaa only");
  });

  it("keeps the unavailable historical answer localized in Chinese", () => {
    const reply = demoAssistantReply("今天有什么需要留意？", "zh", {
      date: "2026-08-07",
    });

    expect(reply.text).toContain("所选日期（2026-08-07）没有可用的演示数据");
    expect(reply.text).toContain("不会把 2026-08-08 的快照冒充为该日期");
    expect(reply.text).not.toContain("16°C");
    expect(reply.text).not.toContain("9.60 c/kWh");
  });
});
