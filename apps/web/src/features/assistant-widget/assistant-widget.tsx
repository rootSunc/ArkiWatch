"use client";

import { FormEvent, useMemo, useState } from "react";

import { formatTimestamp } from "@/features/shared/format";
import { PlatformCategory, PlatformOverviewResponse } from "@/features/data-platform/types";

type AssistantWidgetProps = {
  overview: PlatformOverviewResponse | null;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const DEFAULT_QUESTIONS = [
  "解释当前页面的数据",
  "哪个数据源最近异常？",
  "哪些扩展方向还在规划？",
  "交通和天气有什么值得注意？"
];

function categorySummary(category: PlatformCategory): string {
  const eventMetric = category.summary_metrics.find((metric) => metric.key === "active_events");
  const sourceMetric = category.summary_metrics.find((metric) => metric.key === "source_status");
  return `${category.title}: ${category.status}, ${eventMetric?.value ?? "0"} events, source ${sourceMetric?.value ?? "unknown"}`;
}

function mostImportantCategory(categories: PlatformCategory[]): PlatformCategory | null {
  const score = (category: PlatformCategory) => {
    if (category.status === "alert" || category.status === "failing") {
      return 4;
    }
    if (category.status === "watch" || category.status === "stale") {
      return 3;
    }
    if (category.events.length > 0) {
      return 2;
    }
    return 1;
  };

  return [...categories].sort((left, right) => score(right) - score(left))[0] ?? null;
}

function buildAssistantReply(question: string, overview: PlatformOverviewResponse | null): string {
  if (!overview) {
    return "平台数据暂时不可用。等 /api/platform/overview 恢复后，我可以解释分类数据、图表和数据源状态。";
  }

  const normalizedQuestion = question.toLowerCase();
  const matchedCategory = overview.categories.find((category) =>
    [category.key, category.title.toLowerCase()].some((token) =>
      normalizedQuestion.includes(token)
    )
  );

  if (normalizedQuestion.includes("source") || normalizedQuestion.includes("数据源")) {
    const sourceSummary = overview.sources
      .map((source) => `${source.source_code}: ${source.operational_status}`)
      .join("; ");
    return `当前数据源状态是：${sourceSummary || "暂无数据源状态"}。更新时间：${formatTimestamp(overview.checked_at)}。`;
  }

  if (normalizedQuestion.includes("扩展") || normalizedQuestion.includes("规划")) {
    const plannedCategories = overview.categories
      .filter((category) => (category.stage ?? "connected") !== "connected")
      .map((category) => `${category.title}: ${category.stage ?? "connected"}`)
      .join("; ");
    return `当前扩展目录是：${plannedCategories || "暂无规划分类"}。这些分类已经进入平台目录，但采集器和规则可以按优先级逐步接入。`;
  }

  if (matchedCategory) {
    const metrics = matchedCategory.summary_metrics
      .slice(0, 4)
      .map((metric) => `${metric.label} ${metric.value}${metric.unit ? metric.unit : ""}`)
      .join("; ");
    const latestEvent = matchedCategory.events[0];
    return latestEvent
      ? `${categorySummary(matchedCategory)}。关键指标：${metrics}。最近事件：${latestEvent.title}，${latestEvent.body}`
      : `${categorySummary(matchedCategory)}。关键指标：${metrics}。当前分类没有活跃事件，可以继续查看图表和数据源采集状态。`;
  }

  const importantCategory = mostImportantCategory(overview.categories);
  const categoryList = overview.categories.map(categorySummary).join("; ");
  return importantCategory
    ? `平台整体状态是 ${overview.health_status}。最值得先看的分类是 ${importantCategory.title}，状态为 ${importantCategory.status}。分类概览：${categoryList}。`
    : `平台整体状态是 ${overview.health_status}，但当前没有可展示的分类数据。`;
}

export function AssistantWidget({ overview }: AssistantWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "我可以帮你解释当前数据、图表和数据源状态。"
    }
  ]);
  const suggestedQuestions = useMemo(() => {
    if (!overview) {
      return DEFAULT_QUESTIONS;
    }
    return [
      "解释当前页面的数据",
      `分析 ${overview.categories[0]?.title ?? "Weather"} 数据`,
      "哪个数据源最近异常？",
      "哪些扩展方向还在规划？"
    ];
  }, [overview]);

  const submitQuestion = (question: string) => {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      return;
    }

    const timestamp = Date.now();
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: `user-${timestamp}`, role: "user", text: normalizedQuestion },
      {
        id: `assistant-${timestamp}`,
        role: "assistant",
        text: buildAssistantReply(normalizedQuestion, overview)
      }
    ]);
    setInputValue("");
    setIsOpen(true);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuestion(inputValue);
  };

  return (
    <div className={isOpen ? "assistant-widget assistant-widget-open" : "assistant-widget"}>
      {isOpen ? (
        <section className="assistant-drawer" aria-label="AI data assistant">
          <header>
            <div className="assistant-mini-person" aria-hidden="true">
              <span />
            </div>
            <div>
              <span className="label-text">AI assistant</span>
              <h2>Data explainer</h2>
            </div>
            <button
              aria-label="Close assistant"
              className="assistant-icon-button"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              X
            </button>
          </header>
          <div className="assistant-messages">
            {messages.map((message) => (
              <article className={`assistant-message assistant-message-${message.role}`} key={message.id}>
                {message.text}
              </article>
            ))}
          </div>
          <div className="assistant-suggestions">
            {suggestedQuestions.map((question) => (
              <button key={question} onClick={() => submitQuestion(question)} type="button">
                {question}
              </button>
            ))}
          </div>
          <form className="assistant-form" onSubmit={onSubmit}>
            <input
              aria-label="Ask about platform data"
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Ask about the current data..."
              value={inputValue}
            />
            <button type="submit">Send</button>
          </form>
        </section>
      ) : (
        <button
          aria-label="Open AI data assistant"
          className="assistant-launcher"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <span className="assistant-person" aria-hidden="true">
            <span />
          </span>
          <span className="assistant-bubble">我可以解释当前数据</span>
        </button>
      )}
    </div>
  );
}
