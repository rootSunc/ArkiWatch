"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  applyLanguageMode,
  preferredLanguageMode,
  saveLanguageMode,
  storedLanguageMode,
  useIsomorphicLayoutEffect,
  type LanguageMode,
} from "@/features/data-platform/i18n";

const COPY = {
  en: {
    documentTitle: "Page not found | ArkiWatch",
    code: "ARKIWATCH / 404",
    title: "Page not found",
    description: "The link may be outdated or the page may have moved.",
    navigation: "Not found navigation",
    language: "Display language",
    dataPlatform: "Back to data platform",
    about: "About ArkiWatch",
  },
  zh: {
    documentTitle: "页面不存在 | ArkiWatch",
    code: "ARKIWATCH / 404",
    title: "页面不存在",
    description: "链接可能已过期，或者页面已经移动。",
    navigation: "错误页面导航",
    language: "显示语言",
    dataPlatform: "返回数据平台",
    about: "关于 ArkiWatch",
  },
} as const;

export default function NotFound() {
  const [language, setLanguage] = useState<LanguageMode>("en");
  const copy = COPY[language];

  useIsomorphicLayoutEffect(() => {
    const nextLanguage = storedLanguageMode() ?? preferredLanguageMode();
    setLanguage(nextLanguage);
    applyLanguageMode(nextLanguage);
  }, []);

  useEffect(() => {
    document.title = copy.documentTitle;
  }, [copy.documentTitle]);

  function changeLanguage(nextLanguage: LanguageMode): void {
    setLanguage(nextLanguage);
    saveLanguageMode(nextLanguage);
    applyLanguageMode(nextLanguage);
  }

  return (
    <main aria-labelledby="not-found-title" className="not-found-shell">
      <section className="not-found-panel">
        <header className="not-found-header">
          <p className="not-found-code">{copy.code}</p>
          <div className="not-found-language" aria-label={copy.language} role="group">
            {(["en", "zh"] as const).map((option) => (
              <button
                aria-pressed={language === option}
                className={language === option ? "is-active" : ""}
                key={option}
                onClick={() => changeLanguage(option)}
                type="button"
              >
                {option === "en" ? "EN" : "中文"}
              </button>
            ))}
          </div>
        </header>
        <h1 id="not-found-title">{copy.title}</h1>
        <p className="not-found-copy">{copy.description}</p>
        <nav aria-label={copy.navigation} className="not-found-actions">
          <Link className="not-found-action not-found-action-primary" href="/?view=overview&city=helsinki">
            {copy.dataPlatform}
          </Link>
          <Link className="not-found-action not-found-action-secondary" href="/about">
            {copy.about}
          </Link>
        </nav>
      </section>
    </main>
  );
}
