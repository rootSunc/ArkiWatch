"use client";

import { useCallback, useEffect, useState } from "react";

import { translateText } from "./i18n";
import type { LanguageMode } from "./i18n";

type ShareViewLinkButtonProps = {
  language: LanguageMode;
};

export function ShareViewLinkButton({ language }: ShareViewLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const copyLabel = translateText(language, "Copy view link");
  const copiedLabel = translateText(language, "Link copied");

  const copyLink = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    const url = window.location.href;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <button
      className={`icon-button share-view-link-button${copied ? " share-view-link-button-copied" : ""}`}
      aria-label={copied ? copiedLabel : copyLabel}
      onClick={copyLink}
      title={copied ? copiedLabel : copyLabel}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {copied ? "check" : "link"}
      </span>
    </button>
  );
}
