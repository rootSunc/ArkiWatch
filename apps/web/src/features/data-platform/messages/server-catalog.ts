import "server-only";

import type { LanguageMode } from "../language";
import { enCatalog } from "./catalog.en";
import { zhCatalog } from "./catalog.zh";

export function serverMessageCatalog(language: LanguageMode) {
  return language === "zh" ? zhCatalog : enCatalog;
}
