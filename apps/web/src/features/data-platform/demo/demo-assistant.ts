import type { LanguageMode } from "../i18n";

export type DemoAssistantCitation = {
  source: string;
  checked_at: string | null;
  detail: string;
};

export type DemoAssistantReply = {
  text: string;
  citations: DemoAssistantCitation[];
  answerMode: "fallback";
  model: null;
};

const DEMO_CITATION: DemoAssistantCitation = {
  source: "Static demo fixture",
  checked_at: null,
  detail: "Helsinki snapshot · 2026-08-08",
};

function topicFor(question: string): "current" | "weather" | "air" | "mobility" | "energy" | "sources" {
  const normalized = question.toLocaleLowerCase();

  if (/(source|provider|abnormal|数据源|来源|异常)/u.test(normalized)) {
    return "sources";
  }
  if (/(energy|electricity|price|cost|能源|电价|电力|价格)/u.test(normalized)) {
    return "energy";
  }
  if (/(air|pollution|空气|污染)/u.test(normalized)) {
    return "air";
  }
  if (/(transit|traffic|commute|delay|通勤|交通|延误)/u.test(normalized)) {
    return "mobility";
  }
  if (/(weather|rain|outdoor|temperature|天气|降雨|户外|温度)/u.test(normalized)) {
    return "weather";
  }
  return "current";
}

export function demoAssistantReply(question: string, language: LanguageMode): DemoAssistantReply {
  const topic = topicFor(question);
  const text = language === "zh"
    ? {
        current:
          "这是一个可复现的 Demo 快照：室外约 16°C，存在短时降雨可能；空气质量为 Good；通勤面有 2 个活动提醒；当前家庭电价窗口为 9.60 c/kWh，12:00–14:00 的可灵活安排窗口约为 7.80 c/kWh。建议先查看 Today 的决策卡，再按需要打开对应数据源。",
        weather:
          "Demo 天气快照显示约 16°C，并有短时降雨风险。若要外出，建议带伞并预留几分钟缓冲；真实部署时请连接 API 获取实时预报。",
        air:
          "Demo 快照中的空气质量为 Good，当前适合正常户外活动。这个结论来自静态 HSY 示例数据，生产环境应以最新站点读数为准。",
        mobility:
          "Demo 快照标记了 2 个活动通勤提醒。出发前建议打开 Transit 或 Road & rail 工作区确认线路细节；当前页面不会请求真实交通服务。",
        energy:
          "Demo 快照的当前家庭电价窗口为 9.60 c/kWh，12:00–14:00 的较低价窗口约为 7.80 c/kWh，适合安排可灵活调整的家务用电。真实部署时请连接价格 API，再据此安排洗衣或洗碗。",
        sources:
          "Demo 模式不会访问任何后端或公共数据提供方。页面中的 FMI、HSY、HSL、Digitraffic 和 Fingrid 等来源均由静态 fixture 模拟；切换到 live 模式后，才能检查实时健康状态。",
      }[topic]
    : {
        current:
          "This is a reproducible demo snapshot: outdoor conditions are around 16 °C with a short rain risk; air quality is Good; commute has 2 active notices; the current household electricity window is 9.60 c/kWh, and a flexible-use window around 12:00–14:00 is about 7.80 c/kWh. Start with Today’s decision cards, then open a source workspace if you need detail.",
        weather:
          "The demo weather snapshot is around 16 °C with a short rain risk. Bring an umbrella and leave a few minutes of buffer; connect the API in production for a live forecast.",
        air:
          "The demo snapshot rates air quality as Good, so normal outdoor activity is reasonable. This comes from static HSY example data; production guidance should use the latest station readings.",
        mobility:
          "The demo snapshot marks 2 active commute notices. Open Transit or Road & rail before leaving to inspect route details; this page does not call live transport services.",
        energy:
          "The demo snapshot shows a current household electricity window of 9.60 c/kWh and a lower-cost flexible-use window around 12:00–14:00 at about 7.80 c/kWh. In production, connect the price API before using this for laundry or dishes.",
        sources:
          "Demo mode does not contact the backend or any public-data provider. FMI, HSY, HSL, Digitraffic, and Fingrid are represented by static fixtures; switch to live mode to inspect real source health.",
      }[topic];

  return {
    text,
    citations: [DEMO_CITATION],
    answerMode: "fallback",
    model: null,
  };
}
