"use client";

import Image from "next/image";
import {
  FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./assistant-widget.css";

import {
  AssistantCitationList,
  MAX_VISIBLE_ASSISTANT_CITATIONS,
} from "@/features/assistant-widget/assistant-citations";
import { AssistantMessageBody } from "@/features/assistant-widget/assistant-message-body";
import { formatAssistantScopeDate } from "@/features/assistant-widget/assistant-scope";
import {
  AssistantApiCitation,
  localizeAssistantError,
  parseAssistantStream,
  readAssistantError,
} from "@/features/assistant-widget/assistant-stream";
import { firstAssistantCategoryLabel } from "@/features/assistant-widget/assistant-suggestions";
import { AssistantRetryButton } from "@/features/assistant-widget/assistant-retry-button";
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
  scopeKey?: string;
  openRequest?: number;
  openQuestion?: string | null;
  focusReturnRef?: RefObject<HTMLElement>;
  focusReturnRefs?: Array<RefObject<HTMLElement>>;
  showLauncher?: boolean;
  onOpenView?: (view: string) => void;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  citations?: AssistantApiCitation[];
  answerMode?: "deepseek" | "fallback";
  errorMessage?: string | null;
  retryAfterSeconds?: number | null;
  model?: string | null;
  canRetry?: boolean;
  retryQuestion?: string;
};

export function AssistantWidget({
  overview,
  language,
  city,
  date,
  userId,
  mode,
  scopeKey = "",
  openRequest,
  openQuestion,
  focusReturnRef,
  focusReturnRefs,
  showLauncher = true,
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
  const assistantScopeKey = [
    mode,
    scopeKey,
    city,
    date ?? "live",
    userId,
    overview?.checked_at ?? "",
  ].join(":");

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const totalMovement = useRef(0);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const lastOpenRequest = useRef(0);

  useEffect(() => {
    if (openRequest === undefined || openRequest === lastOpenRequest.current) {
      return;
    }

    lastOpenRequest.current = openRequest;
    setIsOpen(true);
  }, [openQuestion, openRequest]);

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
      e.preventDefault();
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

  const closeAssistant = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => {
      const launcher = launcherRef.current;
      if (launcher && launcher.getClientRects().length > 0) {
        launcher.focus();
        return;
      }

      const focusTargets = focusReturnRefs ?? (focusReturnRef ? [focusReturnRef] : []);
      const focusTarget = focusTargets.find(
        (target) => target.current && target.current.getClientRects().length > 0,
      );
      focusTarget?.current?.focus();
    });
  }, [focusReturnRef, focusReturnRefs]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAssistant();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }

      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !drawer.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !drawer.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeAssistant, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

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
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setIsLoading(false);
    setInputValue("");
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        text: tKey("assistant.welcome"),
      },
    ]);
  }, [assistantScopeKey, tKey]);

  useEffect(() => {
    if (openRequest === undefined) {
      return;
    }

    setInputValue(openQuestion?.trim() ?? "");
  }, [openQuestion, openRequest]);

  useEffect(
    () => () => {
      activeRequestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [isLoading, messages]);

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
    const firstCat = firstAssistantCategoryLabel(overview, language);
    return [
      tKey("assistant.explainCurrent"),
      analyzeCategory(firstCat),
      tKey("assistant.whichSourceAbnormal"),
      tKey("assistant.whichExpansionPlanned")
    ];
  }, [analyzeCategory, language, mode, overview, tKey]);

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
    const requestMessages = [
      ...messages.filter((message) => !message.canRetry),
      userMessage,
    ].slice(-10);
    const requestController = new AbortController();
    activeRequestRef.current?.abort();
    activeRequestRef.current = requestController;

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
        if (activeRequestRef.current !== requestController) {
          return;
        }
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
        signal: requestController.signal,
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
        const details = await readAssistantError(response);
        const error = new Error(details.message) as Error & {
          retryAfterSeconds?: number | null;
        };
        error.retryAfterSeconds = details.retryAfterSeconds;
        throw error;
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
          if (activeRequestRef.current !== requestController) {
            return;
          }

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
                        tKey("assistant.failure"),
                      canRetry: true,
                      retryQuestion: normalizedQuestion,
                    }
                  : message
              )
            );
          }
        }
      }

      if (activeRequestRef.current === requestController && !assistantText.trim()) {
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  text: tKey("assistant.failure"),
                  canRetry: true,
                  retryQuestion: normalizedQuestion,
                }
              : message
          )
        );
      }
    } catch (error) {
      if (requestController.signal.aborted || activeRequestRef.current !== requestController) {
        return;
      }
      const isAssistantHttpError =
        error instanceof Error && "retryAfterSeconds" in error;
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: tKey("assistant.failure"),
                errorMessage: isAssistantHttpError && error instanceof Error
                  ? error.message
                  : null,
                retryAfterSeconds:
                  isAssistantHttpError && error instanceof Error
                    ? (error as Error & { retryAfterSeconds?: number | null })
                        .retryAfterSeconds
                    : null,
                canRetry: true,
                retryQuestion: normalizedQuestion,
              }
            : message
        )
      );
    } finally {
      if (activeRequestRef.current === requestController) {
        activeRequestRef.current = null;
        setIsLoading(false);
      }
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
        <section
          aria-describedby="assistant-scope-label"
          aria-labelledby="assistant-dialog-title"
          aria-modal="true"
          className="assistant-drawer"
          ref={drawerRef}
          role="dialog"
        >
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
              <h2 id="assistant-dialog-title">
                {tKey(mode === "today" ? "assistant.todaySubtitle" : "assistant.subtitle")}
              </h2>
              {appEnv.demoMode ? <p className="assistant-demo-note">{tKey("assistant.demoMode")}</p> : null}
              <div
                aria-label={tKey("assistant.scopeLabel")}
                className="assistant-scope"
                id="assistant-scope-label"
              >
                <span>{assistantScopeLabel}</span>
                <span>{cityLabel(city)}</span>
                <span>{assistantScopeDate}</span>
              </div>
            </div>
            <button
              aria-label={tKey("assistant.close")}
              className="assistant-icon-button"
              onClick={closeAssistant}
              type="button"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </header>
          
          <div
            aria-busy={isLoading}
            aria-live="polite"
            className="assistant-messages"
            ref={messagesRef}
            role="log"
          >
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
                      <span>
                        {localizeAssistantError(
                          message.errorMessage,
                          tKey,
                          message.retryAfterSeconds,
                        )}
                      </span>
                    </p>
                  ) : null}
                  {message.role === "assistant" && message.canRetry && message.retryQuestion ? (
                    <AssistantRetryButton
                      disabled={isLoading}
                      language={language}
                      onRetry={() => {
                        void submitQuestion(message.retryQuestion ?? "");
                      }}
                    />
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
                            String(
                              Math.min(
                                message.citations.length,
                                MAX_VISIBLE_ASSISTANT_CITATIONS,
                              ),
                            ),
                          )}
                        </small>
                        {message.citations.length > MAX_VISIBLE_ASSISTANT_CITATIONS ? (
                          <small>
                            {tKey("assistant.sourcesMore").replace(
                              "{count}",
                              String(message.citations.length - MAX_VISIBLE_ASSISTANT_CITATIONS),
                            )}
                          </small>
                        ) : null}
                      </div>
                      <details className="assistant-citation-details">
                        <summary>{tKey("assistant.viewSources")}</summary>
                        <AssistantCitationList
                          citations={message.citations}
                          language={language}
                          messageId={message.id}
                          onOpenView={(view) => {
                            closeAssistant();
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
              ref={inputRef}
              value={inputValue}
            />
            <button aria-label={tKey("assistant.send")} disabled={isLoading} type="submit">
              <span className="material-symbols-outlined">send</span>
            </button>
          </form>
        </section>
      ) : showLauncher ? (
        <button
          aria-label={tKey("assistant.openAssistant")}
          className="assistant-launcher"
          ref={launcherRef}
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
      ) : null}
    </div>
  );
}
