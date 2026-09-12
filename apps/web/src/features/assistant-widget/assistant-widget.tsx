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
  assistantCitationFollowUp,
} from "@/features/assistant-widget/assistant-citations";
import { AssistantMessageBody } from "@/features/assistant-widget/assistant-message-body";
import { formatAssistantScopeDate } from "@/features/assistant-widget/assistant-scope";
import {
  AssistantApiCitation,
  ASSISTANT_REQUEST_TIMEOUT_MS,
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
  scopePending?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
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

const ASSISTANT_MASCOT_SRC = "/brand/zoro_mascot_launcher.png";

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
  scopePending = false,
  onOpenChange,
  onOpenView,
}: AssistantWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const tKey = useCallback(
    (key: string) => translateMessageKey(language, key),
    [language],
  );
  const analyzeCategory = useCallback(
    (category: string) => tKey("assistant.analyzeCategory").replace("{category}", category),
    [tKey],
  );
  const isHistoricalScope = date !== null;
  const isDemoScope = appEnv.demoMode || overview?.time_scope?.is_demo === true;
  const assistantScopeLabel = isHistoricalScope
    ? tKey(mode === "today" ? "assistant.scopeHistoricalToday" : "assistant.scopeHistoricalData")
    : mode === "today"
      ? tKey("assistant.scopeToday")
      : tKey("assistant.scopeData");
  const assistantScopeDate = date
    ? `${tKey("assistant.scopeHistorical")} · ${formatAssistantScopeDate(date, language)}`
    : isDemoScope
      ? tKey("assistant.demoFixture")
      : tKey("assistant.scopeLive");
  const assistantCoverageArea = overview?.coverage_area?.trim() || cityLabel(city);
  const assistantName = tKey(
    isHistoricalScope
      ? "assistant.historicalTitle"
      : mode === "today"
        ? "assistant.todayTitle"
        : "assistant.title",
  );
  const sourceDocumentation = useMemo(() => {
    const documentation: Record<string, string> = {};

    for (const category of overview?.categories ?? []) {
      const categoryUrl = category.sources.find((source) => source.documentation_url)?.documentation_url;
      if (categoryUrl) {
        documentation[category.key.trim().toLowerCase()] = categoryUrl;
      }

      for (const source of category.sources) {
        if (source.documentation_url) {
          documentation[source.source_code.trim().toLowerCase()] = source.documentation_url;
        }
      }
    }

    return documentation;
  }, [overview]);
  // A background data refresh changes checked_at but not the user's scope.
  // The conversation survives until city, date, workspace, or identity changes.
  const assistantScopeKey = [
    mode,
    scopeKey,
    city,
    date ?? "live",
    userId,
  ].join(":");

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
    if (scopePending) {
      return;
    }
    setIsOpen(true);
  }, [openQuestion, openRequest, scopePending]);

  useEffect(() => {
    if (!scopePending) {
      return;
    }

    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setIsOpen(false);
    setIsLoading(false);
    setInputValue("");
  }, [scopePending]);

  const closeAssistant = useCallback(() => {
    setIsOpen(false);
    onOpenChange?.(false);
    window.requestAnimationFrame(() => {
      const focusTargets = focusReturnRefs ?? (focusReturnRef ? [focusReturnRef] : []);
      const focusTarget = focusTargets.find(
        (target) => target.current && target.current.getClientRects().length > 0,
      );
      focusTarget?.current?.focus();
    });
  }, [focusReturnRef, focusReturnRefs, onOpenChange]);

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

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: tKey("assistant.welcome")
    }
  ]);
  const [helpfulMessageIds, setHelpfulMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setIsLoading(false);
    setInputValue("");
    setHelpfulMessageIds(new Set());
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
    if (isHistoricalScope) {
      return [
        tKey("assistant.historicalExplainSnapshot"),
        tKey("assistant.historicalMostRelevant"),
        tKey("assistant.historicalBestWindow"),
        tKey("assistant.historicalChangedSignals"),
      ];
    }

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
  }, [analyzeCategory, isHistoricalScope, language, mode, overview, tKey]);

  const submitQuestion = async (question: string) => {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || isLoading || scopePending) {
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
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      requestController.abort();
    }, ASSISTANT_REQUEST_TIMEOUT_MS);
    let assistantText = "";

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
        const reply = demoAssistantReply(normalizedQuestion, language, { city, date });
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
      if (
        (requestController.signal.aborted && !didTimeout) ||
        activeRequestRef.current !== requestController
      ) {
        return;
      }
      const isAssistantHttpError =
        error instanceof Error && "retryAfterSeconds" in error;
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: assistantText.trim() ? assistantText : tKey("assistant.failure"),
                errorMessage: didTimeout
                  ? "Assistant request timed out."
                  : isAssistantHttpError && error instanceof Error
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
      window.clearTimeout(timeoutId);
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

  if (!isOpen) {
    return null;
  }

  return (
    <div className={`assistant-widget assistant-widget-open assistant-widget-mode-${mode}`}>
      <div className="assistant-overlay">
        <button
          aria-label={tKey("assistant.dismissOutside")}
          className="assistant-scrim"
          onClick={closeAssistant}
          type="button"
        />

        <section
          aria-describedby="assistant-scope-label"
          aria-labelledby="assistant-dialog-title"
          aria-modal="true"
          className="assistant-panel"
          ref={drawerRef}
          role="dialog"
        >
          <div className="assistant-panel-header">
            <span className="assistant-avatar" aria-hidden="true">
              <Image
                src={ASSISTANT_MASCOT_SRC}
                alt=""
                width={36}
                height={36}
                className="assistant-avatar-mascot"
              />
              <span className="assistant-avatar-status" />
            </span>
            <span className="assistant-panel-identity">
              <h2 id="assistant-dialog-title">{assistantName}</h2>
              <span
                aria-label={`${tKey("assistant.scopeLabel")}: ${assistantScopeLabel}`}
                className="assistant-panel-scope"
                id="assistant-scope-label"
              >
                <span>{assistantCoverageArea}</span>
                <span aria-hidden="true"> · </span>
                <span>{assistantScopeDate}</span>
              </span>
            </span>
            <button
              className="assistant-new-thread"
              onClick={() => {
                activeRequestRef.current?.abort();
                activeRequestRef.current = null;
                setIsLoading(false);
                setInputValue("");
                setHelpfulMessageIds(new Set());
                setMessages([
                  {
                    id: "welcome",
                    role: "assistant",
                    text: tKey("assistant.welcome"),
                  },
                ]);
              }}
              type="button"
            >
              {tKey("assistant.newThread")}
            </button>
            <button
              aria-label={tKey("assistant.close")}
              className="assistant-close"
              onClick={closeAssistant}
              type="button"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          <div
            aria-busy={isLoading}
            aria-live="polite"
            className="assistant-thread"
            ref={messagesRef}
            role="log"
          >
            {messages.map((message) => {
              if (message.role === "assistant" && !message.text.trim()) {
                return null;
              }

              if (message.role === "user") {
                return (
                  <p className="assistant-turn assistant-turn-user" key={message.id}>
                    {message.text}
                  </p>
                );
              }

              const visibleCitations = message.citations?.slice(
                0,
                MAX_VISIBLE_ASSISTANT_CITATIONS,
              );
              const checkedAt = message.citations?.find((citation) => citation.checked_at)
                ?.checked_at;

              return (
                <article className="assistant-turn assistant-turn-assistant" key={message.id}>
                  {message.citations?.length ? (
                    <span className="assistant-answer-provenance">
                      <span className="assistant-answer-provenance-dot" aria-hidden="true" />
                      <span>
                        {tKey("assistant.answeredFromSignals").replace(
                          "{count}",
                          String(
                            Math.min(
                              message.citations.length,
                              MAX_VISIBLE_ASSISTANT_CITATIONS,
                            ),
                          ),
                        )}
                      </span>
                    </span>
                  ) : null}

                  <AssistantMessageBody text={message.text} />

                  {message.errorMessage ? (
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
                  {message.canRetry && message.retryQuestion ? (
                    <AssistantRetryButton
                      disabled={isLoading}
                      language={language}
                      onRetry={() => {
                        void submitQuestion(message.retryQuestion ?? "");
                      }}
                    />
                  ) : null}

                  {message.citations?.length ? (
                    <>
                      <AssistantCitationList
                        citations={message.citations}
                        language={language}
                        messageId={message.id}
                        onOpenView={(view) => {
                          closeAssistant();
                          onOpenView?.(view);
                        }}
                        sourceDocumentation={sourceDocumentation}
                        tKey={tKey}
                      />
                      <footer className="assistant-basis">
                        <span className="assistant-basis-label">{tKey("assistant.basis")}</span>
                        {isDemoScope ? (
                          <span className="assistant-basis-chip">{tKey("assistant.demoFixture")}</span>
                        ) : null}
                        {message.answerMode === "fallback" ? (
                          <span className="assistant-basis-chip">{tKey("assistant.fallback")}</span>
                        ) : null}
                        <span className="assistant-basis-count">
                          {tKey("assistant.sourcesCount").replace(
                            "{count}",
                            String(visibleCitations?.length ?? 0),
                          )}
                        </span>
                        {message.citations.length > MAX_VISIBLE_ASSISTANT_CITATIONS ? (
                          <span className="assistant-basis-count">
                            {tKey("assistant.sourcesMore").replace(
                              "{count}",
                              String(message.citations.length - MAX_VISIBLE_ASSISTANT_CITATIONS),
                            )}
                          </span>
                        ) : null}
                        {checkedAt ? (
                          <time className="assistant-basis-time" dateTime={checkedAt}>
                            {tKey("assistant.checkedAt").replace("{time}", checkedAt)}
                          </time>
                        ) : null}
                        <button
                          aria-pressed={helpfulMessageIds.has(message.id)}
                          className={`assistant-helpful${helpfulMessageIds.has(message.id) ? " assistant-helpful-active" : ""}`}
                          onClick={() => {
                            setHelpfulMessageIds((current) => {
                              const next = new Set(current);
                              if (next.has(message.id)) {
                                next.delete(message.id);
                              } else {
                                next.add(message.id);
                              }
                              return next;
                            });
                          }}
                          type="button"
                        >
                          {tKey(
                            helpfulMessageIds.has(message.id)
                              ? "assistant.helpfulMarked"
                              : "assistant.helpful",
                          )}
                        </button>
                      </footer>
                      {(() => {
                        const followUps = Array.from(
                          new Set(
                            message.citations
                              .map((citation) => assistantCitationFollowUp(citation.source, language))
                              .filter((question): question is string => Boolean(question)),
                          ),
                        ).slice(0, 2);

                        return followUps.length > 0 ? (
                          <div className="assistant-followups">
                            <span>{tKey("assistant.followUp")}</span>
                            <div>
                              {followUps.map((question) => (
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
                          </div>
                        ) : null;
                      })()}
                    </>
                  ) : null}
                </article>
              );
            })}
            {isLoading ? (
              <p className="assistant-turn assistant-turn-assistant assistant-turn-pending">
                {tKey("assistant.loading")}
              </p>
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

          <form className="assistant-composer" onSubmit={onSubmit}>
            <div className="assistant-composer-field">
              <input
                aria-label={tKey("assistant.askInputLabel")}
                disabled={isLoading}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={tKey("assistant.askPlaceholder")}
                ref={inputRef}
                value={inputValue}
              />
              <button aria-label={tKey("assistant.send")} disabled={isLoading} type="submit">
                <span className="material-symbols-outlined" aria-hidden="true">
                  send
                </span>
              </button>
            </div>
            <p className="assistant-composer-note">
              {tKey(appEnv.demoMode ? "assistant.composerNoteDemo" : "assistant.composerNote")}
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
