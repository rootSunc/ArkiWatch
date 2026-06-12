"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./assistant-widget.css";

import { AssistantCitationList } from "@/features/assistant-widget/assistant-citations";
import { AssistantMessageBody } from "@/features/assistant-widget/assistant-message-body";
import { formatAssistantScopeDate } from "@/features/assistant-widget/assistant-scope";
import {
  AssistantApiCitation,
  localizeAssistantError,
  parseAssistantStream,
} from "@/features/assistant-widget/assistant-stream";
import { demoAssistantReply } from "@/features/data-platform/demo/demo-assistant";
import { cityLabel } from "@/features/data-platform/city-scope";
import { PlatformOverviewResponse } from "@/features/data-platform/types";
import { LanguageMode, translateMessageKey } from "@/features/data-platform/i18n";
import { appEnv } from "@/lib/env";

type AssistantWidgetProps = {
  overview: PlatformOverviewResponse | null;
  language: LanguageMode;
  city: string;
  date: string | null;
  userId: string;
  mode: "today" | "data";
  onOpenView?: (view: string) => void;
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

export function AssistantWidget({
  overview,
  language,
  city,
  date,
  userId,
  mode,
  onOpenView,
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
  const assistantScopeLabel = mode === "today"
    ? tKey("assistant.scopeToday")
    : tKey("assistant.scopeData");
  const assistantScopeDate = date
    ? `${tKey("assistant.scopeHistorical")} · ${formatAssistantScopeDate(date, language)}`
    : tKey("assistant.scopeLive");

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
    if (mode === "today") {
      return [
        tKey("assistant.whatShouldIDoToday"),
        tKey("assistant.bestTimeToGoOutside"),
        tKey("assistant.bestTimeToCommute"),
        tKey("assistant.explainCurrent"),
      ];
    }

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
  }, [mode, overview, tKey, analyzeCategory]);

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
      if (appEnv.demoMode) {
        const reply = demoAssistantReply(normalizedQuestion, language);
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  text: reply.text,
                  citations: reply.citations,
                  answerMode: reply.answerMode,
                  model: reply.model,
                }
              : message,
          ),
        );
        return;
      }

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
      className={`assistant-widget assistant-widget-mode-${mode}${isOpen ? " assistant-widget-open" : ""}`}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      {isOpen ? (
        <section className="assistant-drawer" aria-label={tKey("assistant.drawerLabel")}>
          <header>
            <div className="assistant-mini-person" aria-hidden="true">
              <Image
                src="/brand/zoro_mascot.png"
                alt={tKey("assistant.mascotAlt")}
                width={36}
                height={36}
                className="assistant-mini-mascot-img"
              />
            </div>
            <div>
              <span className="label-text">
                {tKey(mode === "today" ? "assistant.todayTitle" : "assistant.title")}
              </span>
              <h2>
                {tKey(mode === "today" ? "assistant.todaySubtitle" : "assistant.subtitle")}
              </h2>
              {appEnv.demoMode ? <p className="assistant-demo-note">{tKey("assistant.demoMode")}</p> : null}
              <div className="assistant-scope" aria-label={tKey("assistant.scopeLabel")}>
                <span>{assistantScopeLabel}</span>
                <span>{cityLabel(city)}</span>
                <span>{assistantScopeDate}</span>
              </div>
            </div>
            <button
              aria-label={tKey("assistant.close")}
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
                  {message.role === "assistant" && message.errorMessage ? (
                    <p className="assistant-message-warning" role="status">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        info
                      </span>
                      <span>{localizeAssistantError(message.errorMessage, tKey)}</span>
                    </p>
                  ) : null}
                  {message.role === "assistant" && message.citations?.length ? (
                    <footer className="assistant-citations">
                      <div className="assistant-citation-heading">
                        <span>{tKey("assistant.basis")}</span>
                        {message.answerMode === "fallback" ? (
                          <em>{tKey("assistant.fallback")}</em>
                        ) : null}
                        <small>
                          {tKey("assistant.sourcesCount").replace(
                            "{count}",
                            String(message.citations.length),
                          )}
                        </small>
                      </div>
                      <details className="assistant-citation-details">
                        <summary>{tKey("assistant.viewSources")}</summary>
                        <AssistantCitationList
                          citations={message.citations}
                          language={language}
                          messageId={message.id}
                          onOpenView={(view) => {
                            setIsOpen(false);
                            onOpenView?.(view);
                          }}
                          tKey={tKey}
                        />
                      </details>
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
              aria-label={tKey("assistant.askInputLabel")}
              disabled={isLoading}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={tKey("assistant.askPlaceholder")}
              value={inputValue}
            />
            <button aria-label={tKey("assistant.send")} disabled={isLoading} type="submit">
              <span className="material-symbols-outlined">send</span>
            </button>
          </form>
        </section>
      ) : (
        <button
          aria-label={tKey("assistant.openAssistant")}
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
              src="/brand/zoro_mascot_launcher.png"
              alt={tKey("assistant.mascotAlt")}
              width={76}
              height={76}
              className="assistant-mascot-img"
              priority
            />
          </div>
          <span className="assistant-launcher-label">
            {tKey(mode === "today" ? "assistant.askToday" : "assistant.askData")}
          </span>
          <span className="assistant-bubble">{tKey("assistant.tooltip")}</span>
        </button>
      )}
    </div>
  );
}
