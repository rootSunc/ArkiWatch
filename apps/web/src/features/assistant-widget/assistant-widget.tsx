"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AssistantMessageBody } from "@/features/assistant-widget/assistant-message-body";
import { PlatformOverviewResponse } from "@/features/data-platform/types";
import { LanguageMode, translateMessageKey } from "@/features/data-platform/i18n";

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
  const tKey = useCallback(
    (key: string) => translateMessageKey(language, key),
    [language],
  );
  const analyzeCategory = useCallback(
    (category: string) => tKey("assistant.analyzeCategory").replace("{category}", category),
    [tKey],
  );

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
      text: tKey("assistant.welcome")
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setMessages((currentMessages) => {
      if (currentMessages.length === 1 && currentMessages[0]?.id === "welcome") {
        return [{ id: "welcome", role: "assistant", text: tKey("assistant.welcome") }];
      }
      return currentMessages;
    });
  }, [language, tKey]);

  const hasUserMessages = useMemo(
    () => messages.some((message) => message.role === "user"),
    [messages],
  );

  const suggestedQuestions = useMemo(() => {
    if (!overview) {
      return [
        tKey("assistant.explainCurrent"),
        tKey("assistant.whichSourceAbnormal"),
        tKey("assistant.whichExpansionPlanned")
      ];
    }
    const firstCat = overview.categories[0]?.title ?? "Weather";
    return [
      tKey("assistant.explainCurrent"),
      analyzeCategory(firstCat),
      tKey("assistant.whichSourceAbnormal"),
      tKey("assistant.whichExpansionPlanned")
    ];
  }, [overview, tKey, analyzeCategory]);

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
                        tKey("assistant.failure")
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
            message.id === assistantMessageId ? { ...message, text: tKey("assistant.failure") } : message
          )
        );
      }
    } catch {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId ? { ...message, text: tKey("assistant.failure") } : message
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
        <section className="assistant-drawer" aria-label="Data assistant">
          <header>
            <div className="assistant-mini-person" aria-hidden="true">
              <Image
                src="/brand/zoro_mascot.png"
                alt="Assistant mascot"
                width={36}
                height={36}
                className="assistant-mini-mascot-img"
              />
            </div>
            <div>
              <span className="label-text">{tKey("assistant.title")}</span>
              <h2>{tKey("assistant.subtitle")}</h2>
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
                      <span>{tKey("assistant.basis")}</span>
                      {message.answerMode === "fallback" ? <em>{tKey("assistant.fallback")}</em> : null}
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
                {tKey("assistant.loading")}
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
              placeholder={tKey("assistant.askPlaceholder")}
              value={inputValue}
            />
            <button disabled={isLoading} type="submit">
              <span className="material-symbols-outlined">send</span>
            </button>
          </form>
        </section>
      ) : (
        <button
          aria-label={tKey("assistant.tooltip")}
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
              alt="Assistant mascot launcher"
              width={76}
              height={76}
              className="assistant-mascot-img"
              priority
            />
          </div>
          <span className="assistant-bubble">{tKey("assistant.tooltip")}</span>
        </button>
      )}
    </div>
  );
}
