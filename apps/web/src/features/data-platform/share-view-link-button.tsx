"use client";

import { useCallback, useEffect, useState } from "react";

import { translateMessageKey } from "./i18n";
import type { LanguageMode } from "./i18n";

type ShareViewLinkButtonProps = {
  language: LanguageMode;
  scopeKey?: string;
};

type CopyState = "idle" | "success" | "error";

export async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the legacy copy path for restricted browser contexts.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy command was rejected.");
    }
  } finally {
    textarea.remove();
  }
}

export function ShareViewLinkButton({ language, scopeKey = "" }: ShareViewLinkButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copyLabel = translateMessageKey(language, "shell.copyViewLink");
  const copiedLabel = translateMessageKey(language, "shell.linkCopied");
  const failedLabel = translateMessageKey(language, "shell.linkCopyFailed");
  const label =
    copyState === "success"
      ? copiedLabel
      : copyState === "error"
        ? failedLabel
        : copyLabel;

  const copyLink = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    const url = window.location.href;

    try {
      await copyTextToClipboard(url);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
  }, []);

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => setCopyState("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  useEffect(() => {
    setCopyState("idle");
  }, [scopeKey]);

  return (
    <button
      className={`icon-button share-view-link-button share-view-link-button-${copyState}`}
      aria-label={label}
      onClick={copyLink}
      title={label}
      type="button"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {copyState === "success"
          ? "check"
          : copyState === "error"
            ? "error"
            : "link"}
      </span>
    </button>
  );
}
