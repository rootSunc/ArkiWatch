"use client";

import { useQuery } from "@tanstack/react-query";

import { appEnv } from "@/lib/env";

import type { LanguageMode } from "../i18n";

const TRANSLATION_TEXT_MAX_LENGTH = 1800;

export type TranslateTextInput = {
  eventId: string;
  text: string;
  sourceLanguage: string;
  targetLanguage: LanguageMode;
  context?: string;
};

export function descriptionQueryKey(
  eventId: string,
  language: LanguageMode,
  text: string,
) {
  return [
    "translate",
    "description",
    eventId,
    language,
    text.slice(0, 80),
    text.length,
  ] as const;
}

async function translateTextRequest(input: TranslateTextInput): Promise<string> {
  const response = await fetch("/api/assistant/translate", {
    body: JSON.stringify({
      context: input.context,
      source_language: input.sourceLanguage,
      target_language: input.targetLanguage,
      text: input.text.slice(0, TRANSLATION_TEXT_MAX_LENGTH),
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Translation request failed.");
  }

  const body = (await response.json().catch(() => null)) as { translated_text?: unknown } | null;
  const translatedText =
    typeof body?.translated_text === "string" ? body.translated_text.trim() : "";

  if (!translatedText) {
    throw new Error("Translation response was empty.");
  }

  return translatedText;
}

export function useEventDescriptionTranslation(input: {
  eventId: string | null;
  language: LanguageMode;
  text: string;
  sourceLanguage: string;
  shouldTranslate: boolean;
  context?: string;
}) {
  return useQuery({
    queryKey: descriptionQueryKey(input.eventId ?? "", input.language, input.text),
    queryFn: () =>
      translateTextRequest({
        eventId: input.eventId as string,
        text: input.text,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.language,
        context: input.context,
      }),
    enabled: Boolean(
      !appEnv.demoMode && input.eventId && input.shouldTranslate && input.text,
    ),
    staleTime: Infinity,
    retry: 1,
  });
}
