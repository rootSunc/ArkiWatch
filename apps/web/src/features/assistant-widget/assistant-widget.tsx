"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { AssistantMessageBody } from "@/features/assistant-widget/assistant-message-body";
import { PlatformOverviewResponse } from "@/features/data-platform/types";
import { LanguageMode } from "@/features/data-platform/i18n";

type AssistantWidgetProps = {
  overview: PlatformOverviewResponse | null;
  language: LanguageMode;
  city: string;
  date: string | null;
  userId: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  citations?: AssistantApiCitation[];
  answerMode?: "deepseek" | "fallback";
  errorMessage?: string | null;
  model?: string | null;
};

type AssistantApiCitation = {
  source: string;
  checked_at: string | null;
  detail: string;
};

type AssistantStreamPayload = {
  content?: string;
  message?: string;
  citations?: AssistantApiCitation[];
  model?: string | null;
  answer_mode?: "deepseek" | "fallback";
  error_message?: string | null;
  answer?: string;
};

type AssistantStreamEvent = {
  event: string;
  data: AssistantStreamPayload;
};

const WIDGET_TRANSLATIONS = {
  en: {
    welcome:
      "Hello! I am your ArkiWatch Data Explainer. Ask about weather, air quality, energy, traffic, sources, or what the current snapshot means — I answer from live platform data and stay on topic.",
    explainCurrent: "Explain the current page's data",
    analyzeCategory: (category: string) => `Analyze ${category} data`,
    whichSourceAbnormal: "Which data source is abnormal recently?",
    whichExpansionPlanned: "What expansion directions are being planned?",
    askPlaceholder: "Ask about current conditions, sources, or this page...",
    send: "Send",
    title: "AI Assistant",
    subtitle: "Data Explainer",
    tooltip: "💡 Need help with data?",
    loading: "Reading ArkiWatch data...",
    failure: "I could not reach the data assistant. Please try again after refreshing the page.",
    basis: "Basis",
    fallback: "Fallback",
    offlinePrompt: "Platform data is temporarily unavailable. Once the overview is healthy, I can assist you with telemetry charts and logs."
  },
  zh: {
    welcome:
      "您好！我是 ArkiWatch 数据解析助手。可询问天气、空气质量、能源、交通、数据源状态，或当前快照的含义；我会结合平台数据直接作答。",
    explainCurrent: "解释当前页面的数据",
    analyzeCategory: (category: string) => `分析 ${category} 数据`,
    whichSourceAbnormal: "哪个数据源最近异常？",
    whichExpansionPlanned: "哪些扩展方向还在规划？",
    askPlaceholder: "询问当前状况、数据源或本页数据…",
    send: "发送",
    title: "AI 助手",
    subtitle: "数据解析器",
    tooltip: "💡 需要数据协助吗？",
    loading: "正在读取 ArkiWatch 数据...",
    failure: "暂时无法连接数据助手。请刷新页面后再试。",
    basis: "依据",
    fallback: "兜底回答",
    offlinePrompt: "数据平台暂时不可用。待 overview 服务正常后，我可以帮您解析遥测图表和日志。"
  }
};

function parseAssistantStream(
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

function citationLabel(citation: AssistantApiCitation): string {
  return citation.checked_at
    ? `${citation.source} @ ${citation.checked_at}`
    : citation.source;
}

export function AssistantWidget({
  overview,
  language,
  city,
  date,
  userId,
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
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setMessages((currentMessages) => {
      if (currentMessages.length === 1 && currentMessages[0]?.id === "welcome") {
        return [{ id: "welcome", role: "assistant", text: t.welcome }];
      }
      return currentMessages;
    });
  }, [t.welcome]);

  const hasUserMessages = useMemo(
    () => messages.some((message) => message.role === "user"),
    [messages],
  );

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
  }, [overview, t]);

  const submitQuestion = async (question: string) => {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || isLoading) {
      return;
    }

    const timestamp = Date.now();
    const userMessage: ChatMessage = {
      id: `user-${timestamp}`,
      role: "user",
      text: normalizedQuestion
    };
    const assistantMessageId = `assistant-${timestamp}`;
    const requestMessages = [...messages, userMessage].slice(-10);

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      {
        id: assistantMessageId,
        role: "assistant",
        text: ""
      }
    ]);
    setInputValue("");
    setIsOpen(true);
    setIsLoading(true);

    try {
      const response = await fetch("/api/assistant/chat/stream", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: requestMessages.map((message) => ({
            role: message.role,
            content: message.text
          })),
          language,
          city,
          date: date ?? undefined,
          user_id: userId || undefined
        })
      });

      if (!response.ok || !response.body) {
        throw new Error("Assistant stream failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseAssistantStream(buffer);
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          if (event.event === "token" && event.data.content) {
            assistantText += event.data.content;
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, text: assistantText }
                  : message
              )
            );
          }

          if (event.event === "meta" || event.event === "done") {
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      citations: event.data.citations ?? message.citations,
                      answerMode: event.data.answer_mode ?? message.answerMode,
                      errorMessage: event.data.error_message ?? message.errorMessage,
                      model: event.data.model ?? message.model
                    }
                  : message
              )
            );
          }

          if (event.event === "error") {
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      errorMessage:
                        event.data.error_message ??
                        event.data.message ??
                        event.data.content ??
                        t.failure
                    }
                  : message
              )
            );
          }
        }
      }

      if (!assistantText.trim()) {
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessageId ? { ...message, text: t.failure } : message
          )
        );
      }
    } catch {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId ? { ...message, text: t.failure } : message
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitQuestion(inputValue);
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
            {messages.map((message) => {
              if (message.role === "assistant" && !message.text.trim()) {
                return null;
              }

              return (
                <article className={`assistant-message assistant-message-${message.role}`} key={message.id}>
                  {message.role === "assistant" ? (
                    <AssistantMessageBody text={message.text} />
                  ) : (
                    <span>{message.text}</span>
                  )}
                  {message.role === "assistant" && message.citations?.length ? (
                    <footer className="assistant-citations">
                      <span>{t.basis}</span>
                      {message.answerMode === "fallback" ? <em>{t.fallback}</em> : null}
                      {message.citations.slice(0, 4).map((citation) => (
                        <small key={`${message.id}-${citation.source}`}>
                          {citationLabel(citation)}
                        </small>
                      ))}
                    </footer>
                  ) : null}
                </article>
              );
            })}
            {isLoading ? (
              <article className="assistant-message assistant-message-assistant assistant-message-pending">
                {t.loading}
              </article>
            ) : null}
          </div>
          
          {!hasUserMessages ? (
            <div className="assistant-suggestions">
              {suggestedQuestions.map((question) => (
                <button
                  disabled={isLoading}
                  key={question}
                  onClick={() => {
                    void submitQuestion(question);
                  }}
                  type="button"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}
          
          <form className="assistant-form" onSubmit={onSubmit}>
            <input
              aria-label="Ask about platform data"
              disabled={isLoading}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={t.askPlaceholder}
              value={inputValue}
            />
            <button disabled={isLoading} type="submit">
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
