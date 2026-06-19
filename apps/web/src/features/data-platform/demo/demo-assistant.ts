import type { LanguageMode } from "../i18n";
import { cityLabel, normalizeCityValue } from "../city-scope";
import { DEMO_CITY, DEMO_SNAPSHOT_DATE } from "./demo-data";

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

export type DemoAssistantScope = {
  city?: string | null;
  date?: string | null;
};

function citationFor(scope: {
  city: string;
  citySupported: boolean;
  date: string | null;
  snapshotAvailable: boolean;
}): DemoAssistantCitation {
  if (!scope.citySupported) {
    return {
      source: "Static demo fixture",
      checked_at: null,
      detail: `${scope.city} · demo coverage is Helsinki / Uusimaa only`,
    };
  }

  if (!scope.snapshotAvailable && scope.date) {
    return {
      source: "Static demo fixture",
      checked_at: null,
      detail: `${scope.city} · no demo data for ${scope.date}`,
    };
  }

  return {
    source: "Static demo fixture",
    checked_at: null,
    detail: scope.date
      ? `${scope.city} historical snapshot · ${scope.date}`
      : `${scope.city} snapshot · ${DEMO_SNAPSHOT_DATE}`,
  };
}

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

export function demoAssistantReply(
  question: string,
  language: LanguageMode,
  scope: DemoAssistantScope = {},
): DemoAssistantReply {
  const topic = topicFor(question);
  const cityRef = normalizeCityValue(scope.city);
  const city = cityLabel(cityRef);
  const citySupported = cityRef === DEMO_CITY;
  const date = scope.date?.trim() || null;
  const historical = date !== null;
  const snapshotAvailable = citySupported && (!historical || date === DEMO_SNAPSHOT_DATE);

  if (!snapshotAvailable) {
    const text = !citySupported
      ? language === "zh"
        ? `演示数据目前只覆盖 Helsinki / Uusimaa；当前城市为 ${city}，没有可用的静态数据。我不会把 Helsinki 的快照冒充为 ${city} 的观测或生活建议。请选择 Helsinki，或连接实时 API。`
        : `The demo data currently covers Helsinki / Uusimaa only. There is no static observation for ${city}; I will not relabel the Helsinki snapshot as ${city} data or use it for life advice. Choose Helsinki or connect the live API.`
      : language === "zh"
        ? `所选日期（${date}）没有可用的演示数据。我不会把 ${DEMO_SNAPSHOT_DATE} 的快照冒充为该日期，也不会据此给出天气、空气、交通或能源建议。请选择 ${DEMO_SNAPSHOT_DATE}，或切换到实时模式。`
        : `There is no demo data for the selected date (${date}). I will not use the ${DEMO_SNAPSHOT_DATE} snapshot as a substitute for that date or give weather, air-quality, mobility, or energy advice from it. Choose ${DEMO_SNAPSHOT_DATE} or switch to live mode.`;

    return {
      text,
      citations: [citationFor({ city, citySupported, date, snapshotAvailable })],
      answerMode: "fallback",
      model: null,
    };
  }

  const text = language === "zh"
    ? {
        current:
          historical
            ? `这是 ${city} 在 ${date} 的可复现历史演示快照：室外约 16°C，记录到短时降雨可能；空气质量为良好；通勤面有 2 个活动提醒；记录的家庭电价窗口为 9.60 c/kWh，12:00–14:00 的可灵活安排窗口约为 7.80 c/kWh。建议把它作为历史证据查看，不要当作今天的建议。`
            : "这是一个可复现的演示快照：室外约 16°C，存在短时降雨可能；空气质量为良好；通勤面有 2 个活动提醒；当前家庭电价窗口为 9.60 c/kWh，12:00–14:00 的可灵活安排窗口约为 7.80 c/kWh。建议先查看今日的决策卡，再按需要打开对应数据源。",
        weather:
          historical
            ? `${city} 在 ${date} 的历史天气快照记录约 16°C，并有短时降雨风险。这只用于解释所选日期的证据；真实部署时请连接 API 获取对应日期的预报。`
            : "演示天气快照显示约 16°C，并有短时降雨风险。若要外出，建议带伞并预留几分钟缓冲；真实部署时请连接 API 获取实时预报。",
        air:
          historical
            ? `${city} 在 ${date} 的历史演示快照中，空气质量为良好。这个结论只用于历史证据查看，来自静态 HSY 示例数据；生产环境应以对应日期的站点读数为准。`
            : "演示快照中的空气质量为良好，当前适合正常户外活动。这个结论来自静态 HSY 示例数据，生产环境应以最新站点读数为准。",
        mobility:
          historical
            ? `${city} 在 ${date} 的历史演示快照标记了 2 个通勤提醒。请打开公共交通或道路与铁路工作区查看所选日期的线路证据；当前页面不会请求真实交通服务。`
            : "演示快照标记了 2 个通勤提醒。出发前建议打开公共交通或道路与铁路工作区确认线路细节；当前页面不会请求真实交通服务。",
        energy:
          historical
            ? `${city} 在 ${date} 的历史演示快照记录家庭电价窗口为 9.60 c/kWh，12:00–14:00 的较低价窗口约为 7.80 c/kWh。它不能用于安排今天的家务用电；真实部署时请连接价格 API。`
            : "演示快照的当前家庭电价窗口为 9.60 c/kWh，12:00–14:00 的较低价窗口约为 7.80 c/kWh，适合安排可灵活调整的家务用电。真实部署时请连接价格 API，再据此安排洗衣或洗碗。",
        sources:
          historical
            ? `这是 ${city} 在 ${date} 的静态历史演示快照，不会访问任何后端或公共数据提供方。FMI、HSY、HSL、Digitraffic 和 Fingrid 等来源均由示例数据模拟；切换到实时模式后，才能检查实时健康状态。`
            : "演示模式不会访问任何后端或公共数据提供方。页面中的 FMI、HSY、HSL、Digitraffic 和 Fingrid 等来源均由静态示例数据模拟；切换到实时模式后，才能检查实时健康状态。",
      }[topic]
    : {
        current:
          historical
            ? `This is a reproducible historical demo snapshot for ${city} on ${date}: outdoor conditions were around 16 °C with a short rain risk; air quality was Good; commute had 2 active notices; the recorded household electricity window was 9.60 c/kWh, with a flexible-use window around 12:00–14:00 at about 7.80 c/kWh. Treat it as historical evidence, not advice for today.`
            : "This is a reproducible demo snapshot: outdoor conditions are around 16 °C with a short rain risk; air quality is Good; commute has 2 active notices; the current household electricity window is 9.60 c/kWh, and a flexible-use window around 12:00–14:00 is about 7.80 c/kWh. Start with Today’s decision cards, then open a source workspace if you need detail.",
        weather:
          historical
            ? `The historical demo weather snapshot for ${city} on ${date} recorded around 16 °C with a short rain risk. Use it to explain the selected date only; connect the API in production for a date-specific forecast.`
            : "The demo weather snapshot is around 16 °C with a short rain risk. Bring an umbrella and leave a few minutes of buffer; connect the API in production for a live forecast.",
        air:
          historical
            ? `The historical demo snapshot for ${city} on ${date} rated air quality as Good. This is evidence for the selected date only and comes from static HSY example data; production guidance should use readings from that date.`
            : "The demo snapshot rates air quality as Good, so normal outdoor activity is reasonable. This comes from static HSY example data; production guidance should use the latest station readings.",
        mobility:
          historical
            ? `The historical demo snapshot for ${city} on ${date} marked 2 commute notices. Open Transit or Road & rail to inspect evidence from the selected date; this page does not call live transport services.`
            : "The demo snapshot marks 2 active commute notices. Open Transit or Road & rail before leaving to inspect route details; this page does not call live transport services.",
        energy:
          historical
            ? `The historical demo snapshot for ${city} on ${date} recorded a household electricity window of 9.60 c/kWh and a lower-cost flexible-use window around 12:00–14:00 at about 7.80 c/kWh. Do not use it to plan today’s laundry or dishes; connect the price API in production.`
            : "The demo snapshot shows a current household electricity window of 9.60 c/kWh and a lower-cost flexible-use window around 12:00–14:00 at about 7.80 c/kWh. In production, connect the price API before using this for laundry or dishes.",
        sources:
          historical
            ? `This is a static historical demo snapshot for ${city} on ${date}; it does not contact the backend or any public-data provider. FMI, HSY, HSL, Digitraffic, and Fingrid are represented by fixtures; switch to live mode to inspect real source health.`
            : "Demo mode does not contact the backend or any public-data provider. FMI, HSY, HSL, Digitraffic, and Fingrid are represented by static fixtures; switch to live mode to inspect real source health.",
      }[topic];

  return {
    text,
    citations: [citationFor({ city, citySupported, date, snapshotAvailable })],
    answerMode: "fallback",
    model: null,
  };
}
