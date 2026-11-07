"use client";

import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "@/features/shared/material-icon";
import { useCityCoverage } from "./hooks/use-city-coverage";
import { displayTitle } from "./data-platform-view-model";
import { useI18n } from "./i18n";
import { localizedContent } from "./content-localization";
import type { PlatformCategory, PlatformEvent } from "./types";

export function CommandPalette({
  categories,
  events,
  onSelectNav,
  onSelectCity,
  onOpenEvent,
  onAsk,
}: {
  categories: PlatformCategory[];
  events: PlatformEvent[];
  onSelectNav: (key: string) => void;
  onSelectCity: (city: string) => void;
  onOpenEvent: (e: PlatformEvent) => void;
  onAsk: (q?: string) => void;
}) {
  const { language, tKey } = useI18n();
  const coverage = useCityCoverage();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const close = () => {
    setOpen(false);
    dialogRef.current?.close();
    returnRef.current?.focus();
  };
  useEffect(() => {
    const show = () => {
      returnRef.current = document.activeElement as HTMLElement;
      setOpen(true);
      setQuery("");
    };
    let prefix = 0;
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        show();
        return;
      }
      if (
        (event.target as HTMLElement)?.closest(
          "input, textarea, select, [contenteditable], dialog",
        ) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key === "g") {
        prefix = Date.now();
        return;
      }
      if (Date.now() - prefix < 1000) {
        const target = (
          { h: "overview", e: "events", s: "sources" } as Record<string, string>
        )[event.key];
        if (target) {
          event.preventDefault();
          onSelectNav(target);
          prefix = 0;
        }
      }
    };
    window.addEventListener("arkiwatch:search", show);
    window.addEventListener("keydown", handle);
    return () => {
      window.removeEventListener("arkiwatch:search", show);
      window.removeEventListener("keydown", handle);
    };
  }, [onSelectNav]);
  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      inputRef.current?.focus();
    }
  }, [open]);
  const q = query.toLocaleLowerCase();
  const commands = [
    {
      key: "home",
      label: tKey("shell.navHome"),
      icon: "home",
      action: () => onSelectNav("overview"),
    },
    ...categories.map((c) => ({
      key: c.key,
      label: displayTitle(c, language),
      icon: "database",
      action: () => onSelectNav(c.key),
    })),
    {
      key: "sources",
      label: tKey("shell.navSources"),
      icon: "monitor_heart",
      action: () => onSelectNav("sources"),
    },
    {
      key: "settings",
      label: tKey("shell.personalSettingsTitle"),
      icon: "settings",
      action: () => {
        window.location.assign("/settings");
      },
    },
    ...coverage.cities.map((c) => ({
      key: c.city_ref,
      label: c.label,
      icon: "location_on",
      action: () => onSelectCity(c.city_ref),
    })),
    ...events.map((e) => ({
      key: e.id,
      label: localizedContent(language, e.title, e.title_zh),
      icon: "event",
      action: () => onOpenEvent(e),
    })),
  ]
    .filter((c) => c.label.toLocaleLowerCase().includes(q))
    .slice(0, 12);
  return (
    <dialog
      className="command-palette"
      ref={dialogRef}
      aria-labelledby="command-title"
      onCancel={() => close()}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          const buttons = Array.from(
            dialogRef.current?.querySelectorAll<HTMLButtonElement>(
              ".command-result",
            ) ?? [],
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
          ]?.focus();
        }
      }}
    >
      <header>
        <h2 id="command-title">{tKey("shell.commands")}</h2>
        <button
          className="icon-button"
          type="button"
          onClick={close}
          aria-label={tKey("shell.close")}
        >
          <MaterialIcon name="close" />
        </button>
      </header>
      <input
        aria-label={tKey("shell.commandSearch")}
        placeholder={tKey("shell.commandSearch")}
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="command-results">
        {commands.map((c) => (
          <button
            className="command-result"
            key={c.key}
            onClick={() => {
              close();
              c.action();
            }}
            type="button"
          >
            <MaterialIcon name={c.icon} />
            <span>{c.label}</span>
            <span aria-hidden="true">↵</span>
          </button>
        ))}
        <button
          className="command-result"
          onClick={() => {
            close();
            onAsk(query || undefined);
          }}
          type="button"
        >
          <MaterialIcon name="chat" />
          <span>
            {tKey("shell.ask")}
            {query ? ` · ${query}` : ""}
          </span>
        </button>
      </div>
      <footer>↑ ↓ · ↵ · Esc</footer>
    </dialog>
  );
}
