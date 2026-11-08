"use client";

import { hasMessageCatalog, installMessageCatalog, type LanguageMode } from "../i18n";

export async function ensureMessageCatalog(language: LanguageMode): Promise<void> {
  if (hasMessageCatalog(language)) {
    return;
  }

  const catalog =
    language === "zh"
      ? (await import("./catalog.zh")).zhCatalog
      : (await import("./catalog.en")).enCatalog;
  installMessageCatalog(language, catalog);
}
