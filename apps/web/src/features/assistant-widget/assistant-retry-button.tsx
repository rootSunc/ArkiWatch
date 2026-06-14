"use client";

import { LanguageMode, translateMessageKey } from "@/features/data-platform/i18n";

export function AssistantRetryButton({
  disabled = false,
  language,
  onRetry,
}: {
  disabled?: boolean;
  language: LanguageMode;
  onRetry: () => void;
}) {
  const label = translateMessageKey(language, "assistant.retry");
  const ariaLabel = translateMessageKey(language, "assistant.retryAssistant");

  return (
    <button
      aria-label={ariaLabel}
      className="assistant-message-retry"
      disabled={disabled}
      onClick={onRetry}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        refresh
      </span>
      {label}
    </button>
  );
}
