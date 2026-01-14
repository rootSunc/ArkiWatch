"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { formatTimestamp } from "@/features/shared/format";
import { PlatformCategory, PlatformOverviewResponse } from "@/features/data-platform/types";
import { LanguageMode, translateText } from "@/features/data-platform/i18n";

type AssistantWidgetProps = {
  overview: PlatformOverviewResponse | null;
  language: LanguageMode;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const WIDGET_TRANSLATIONS = {
  en: {
    welcome: "Hello! I am your AI Data Assistant. I can help explain telemetry records, sensor statuses, and system alerts.",
    explainCurrent: "Explain the current page's data",
    analyzeCategory: (category: string) => `Analyze ${category} data`,
    whichSourceAbnormal: "Which data source is abnormal recently?",
    whichExpansionPlanned: "What expansion directions are being planned?",
    askPlaceholder: "Ask about the current data...",
    send: "Send",
    title: "AI Assistant",
    subtitle: "Data Explainer",
    tooltip: "💡 Need help with data?",
    offlinePrompt: "Platform data is temporarily unavailable. Once the overview is healthy, I can assist you with telemetry charts and logs."
  },
  zh: {
    welcome: "您好！我是您的 AI 数据助手。我可以帮您解释当前平台的遥测数据、传感器运行状态以及系统警报。",
    explainCurrent: "解释当前页面的数据",
    analyzeCategory: (category: string) => `分析 ${category} 数据`,
    whichSourceAbnormal: "哪个数据源最近异常？",
    whichExpansionPlanned: "哪些扩展方向还在规划？",
    askPlaceholder: "询问关于当前数据的任何问题...",
    send: "发送",
    title: "AI 助手",
    subtitle: "数据解析器",
    tooltip: "💡 需要数据协助吗？",
    offlinePrompt: "数据平台暂时不可用。待 overview 服务正常后，我可以帮您解析遥测图表和日志。"
  }
};



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

function buildAssistantReply(question: string, overview: PlatformOverviewResponse | null, language: LanguageMode): string {
  if (!overview) {
    return WIDGET_TRANSLATIONS[language].offlinePrompt;
  }

  const normalizedQuestion = question.toLowerCase();
  const matchedCategory = overview.categories.find((category) =>
    [category.key, category.title.toLowerCase()].some((token) =>
      normalizedQuestion.includes(token)
    )
  );

  if (normalizedQuestion.includes("source") || normalizedQuestion.includes("数据源")) {
    const sourceSummary = overview.sources
      .map((source) => `${source.source_code}: ${translateText(language, source.operational_status)}`)
      .join("; ");
    return language === "zh"
      ? `当前数据源状态是：${sourceSummary || "暂无数据源状态"}。更新时间：${formatTimestamp(overview.checked_at, "dateTime", language)}。`
      : `Current data sources are: ${sourceSummary || "No source status available"}. Updated at: ${formatTimestamp(overview.checked_at, "dateTime", language)}.`;
  }

  if (normalizedQuestion.includes("扩展") || normalizedQuestion.includes("规划") || normalizedQuestion.includes("expansion") || normalizedQuestion.includes("plan")) {
    const plannedCategories = overview.categories
      .filter((category) => (category.stage ?? "connected") !== "connected")
      .map((category) => `${translateText(language, category.title)}: ${translateText(language, category.stage ?? "connected")}`)
      .join("; ");
    return language === "zh"
      ? `当前扩展目录是：${plannedCategories || "暂无规划分类"}。这些分类已录入平台目录，后续可按优先级配置采集器和规则。`
      : `Planned expansion categories are: ${plannedCategories || "No planned categories"}. These are in the catalog and will be integrated with high priority.`;
  }

  if (matchedCategory) {
    const metrics = matchedCategory.summary_metrics
      .slice(0, 4)
      .map((metric) => `${translateText(language, metric.label)} ${metric.value}${metric.unit ? metric.unit : ""}`)
      .join("; ");
    const latestEvent = matchedCategory.events[0];
    const translatedTitle = translateText(language, matchedCategory.title);
    const translatedStatus = translateText(language, matchedCategory.status);
    if (language === "zh") {
      return latestEvent
        ? `${translatedTitle}分类状态目前为 ${translatedStatus}。关键指标：${metrics}。最近事件：${latestEvent.title}，${latestEvent.body}`
        : `${translatedTitle}分类状态目前为 ${translatedStatus}。关键指标：${metrics}。当前分类没有活跃事件，采集通道运转正常。`;
    } else {
      return latestEvent
        ? `${translatedTitle} category status is currently ${translatedStatus}. Metrics: ${metrics}. Recent event: ${latestEvent.title} - ${latestEvent.body}`
        : `${translatedTitle} category status is currently ${translatedStatus}. Metrics: ${metrics}. There are no active events for this channel, and telemetry pipeline is nominal.`;
    }
  }

  const importantCategory = mostImportantCategory(overview.categories);
  const categoryList = overview.categories.map((category) => `${translateText(language, category.title)} (${translateText(language, category.status)})`).join("; ");
  const translatedHealthStatus = translateText(language, overview.health_status);
  if (language === "zh") {
    return importantCategory
      ? `平台整体健康状态是 ${translatedHealthStatus}。当前最值得关注的分类是 ${translateText(language, importantCategory.title)}（状态为 ${translateText(language, importantCategory.status)}）。全部分类概览：${categoryList}。`
      : `平台整体状态是 ${translatedHealthStatus}，但当前没有可展示的分类数据。`;
  } else {
    return importantCategory
      ? `Platform health status is ${translatedHealthStatus}. The most critical category to inspect is ${translateText(language, importantCategory.title)} (${translateText(language, importantCategory.status)}). Category summary: ${categoryList}.`
      : `Platform health status is ${translatedHealthStatus}, but no category metrics are loaded.`;
  }
}

export function AssistantWidget({
  overview,
  language,
}: AssistantWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const t = WIDGET_TRANSLATIONS[language] || WIDGET_TRANSLATIONS.en;

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const totalMovement = useRef(0);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      totalMovement.current = Math.sqrt(dx * dx + dy * dy);
      setPosition({
        x: dragStart.current.posX + dx,
        y: dragStart.current.posY + dy,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      const dx = touch.clientX - dragStart.current.x;
      const dy = touch.clientY - dragStart.current.y;
      totalMovement.current = Math.sqrt(dx * dx + dy * dy);
      setPosition({
        x: dragStart.current.posX + dx,
        y: dragStart.current.posY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleMouseUp);
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    totalMovement.current = 0;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    setIsDragging(true);
    dragStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      posX: position.x,
      posY: position.y,
    };
    totalMovement.current = 0;
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: t.welcome
    }
  ]);

  const suggestedQuestions = useMemo(() => {
    if (!overview) {
      return [
        t.explainCurrent,
        t.whichSourceAbnormal,
        t.whichExpansionPlanned
      ];
    }
    const firstCat = overview.categories[0]?.title ?? "Weather";
    return [
      t.explainCurrent,
      t.analyzeCategory(firstCat),
      t.whichSourceAbnormal,
      t.whichExpansionPlanned
    ];
  }, [overview, t, language]);

  const submitQuestion = (question: string) => {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      return;
    }

    const timestamp = Date.now();
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: `user-${timestamp}`, role: `user`, text: normalizedQuestion },
      {
        id: `assistant-${timestamp}`,
        role: `assistant`,
        text: buildAssistantReply(normalizedQuestion, overview, language)
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
    <div
      className={`assistant-widget ${isOpen ? "assistant-widget-open" : ""}`}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      {isOpen ? (
        <section className="assistant-drawer" aria-label="AI data assistant">
          <header>
            <div className="assistant-mini-person" aria-hidden="true">
              <Image
                src="/brand/zoro_mascot.png"
                alt="AI Mascot Mini"
                width={36}
                height={36}
                className="assistant-mini-mascot-img"
              />
            </div>
            <div>
              <span className="label-text">{t.title}</span>
              <h2>{t.subtitle}</h2>
            </div>
            <button
              aria-label="Close assistant"
              className="assistant-icon-button"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <span className="material-symbols-outlined">close</span>
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
              placeholder={t.askPlaceholder}
              value={inputValue}
            />
            <button type="submit">
              <span className="material-symbols-outlined">send</span>
            </button>
          </form>
        </section>
      ) : (
        <button
          aria-label={t.tooltip}
          className="assistant-launcher"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onClick={(e) => {
            if (totalMovement.current > 5) {
              e.preventDefault();
              e.stopPropagation();
            } else {
              setIsOpen(true);
            }
          }}
          type="button"
        >
          <div className="assistant-mascot-wrapper">
            <Image
              src="/brand/zoro_mascot.png"
              alt="AI Mascot Launcher"
              width={76}
              height={76}
              className="assistant-mascot-img"
              priority
            />
          </div>
          <span className="assistant-bubble">{t.tooltip}</span>
        </button>
      )}
    </div>
  );
}
