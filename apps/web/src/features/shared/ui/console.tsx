"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/features/data-platform/i18n";
import { formatTimestamp } from "@/features/shared/format";
import { useMediaQuery } from "../use-media-query";
import { MaterialIcon } from "../material-icon";
import styles from "./console.module.css";

export type Tone = "good" | "warn" | "bad" | "neutral";
export type Evidence = {
  provider?: string | null;
  station?: string | null;
  observedAt?: string | null;
  validAt?: string | null;
  method?: string | null;
  licence?: string | null;
  href?: string | null;
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  const resolved = ["healthy", "ready", "fetched", "low", "info"].includes(tone)
    ? "good"
    : ["stale", "delayed", "medium"].includes(tone)
      ? "warn"
      : ["failed", "error", "critical", "high"].includes(tone)
        ? "bad"
        : tone;
  return (
    <span className={styles.badge} data-tone={resolved}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function ModePill({
  demo,
  date,
  warning = false,
}: {
  demo: boolean;
  date: string | null;
  warning?: boolean;
}) {
  const { tKey } = useI18n();
  return (
    <span
      className={styles.mode}
      data-tone={warning ? "warn" : demo || date ? "neutral" : "good"}
    >
      <i aria-hidden="true" />
      {date
        ? `${tKey("shell.historicalMode")} · ${date}`
        : tKey(demo ? "shell.demoSnapshot" : "shell.liveMode")}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  footer,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className}`}>
      {title ? (
        <header className={styles.cardHeader}>
          <h2>{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={styles.cardBody}>{children}</div>
      {footer ? <footer className={styles.cardFooter}>{footer}</footer> : null}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  status,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <div className={styles.heading}>
          <h1>{title}</h1>
          {status}
        </div>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

function readableEvidenceTime(
  value: string | null | undefined,
  language: "en" | "zh",
  empty: string,
) {
  if (!value?.trim()) {
    return empty;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value;
  }
  return formatTimestamp(value, "dateTime", language, "Europe/Helsinki");
}

export function EvidencePopover({
  evidence,
  children,
}: {
  evidence: Evidence;
  children?: ReactNode;
}) {
  const { language, tKey } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!open) return;
    const place = () => {
      if (window.innerWidth <= 768) {
        setPosition(undefined);
        return;
      }
      const anchor = rootRef.current?.getBoundingClientRect();
      const popup = popoverRef.current?.getBoundingClientRect();
      if (!anchor || !popup) return;
      const left = Math.max(
        16,
        Math.min(anchor.left, window.innerWidth - popup.width - 16),
      );
      const top =
        anchor.bottom + popup.height + 8 <= window.innerHeight - 16
          ? anchor.bottom + 8
          : Math.max(16, anchor.top - popup.height - 8);
      setPosition({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      clearTimeout(closeTimer.current);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <span
      ref={rootRef}
      className={styles.evidence}
      onMouseEnter={() => {
        clearTimeout(closeTimer.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        if (!rootRef.current?.contains(document.activeElement)) {
          closeTimer.current = setTimeout(() => setOpen(false), 180);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      {children}
      <button
        aria-label={tKey("shell.viewEvidence")}
        aria-expanded={open}
        // The popover exists only while open. Referencing it only then also keeps
        // useId out of server HTML, where it drifts under the lazily loaded router.
        aria-controls={open ? id : undefined}
        className={styles.evidenceTrigger}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget))
            setOpen(false);
        }}
        type="button"
      >
        <MaterialIcon name="info" />
      </button>
      {open ? (
        <span
          ref={popoverRef}
          style={position}
          className={styles.popover}
          id={id}
          onBlur={(event) => {
            if (
              !event.currentTarget.parentElement?.contains(event.relatedTarget)
            )
              setOpen(false);
          }}
        >
          <strong>{tKey("shell.viewEvidence")}</strong>
          <dl>
            {[
              ["provider", evidence.provider],
              ["station", evidence.station],
              ["observationTime", evidence.observedAt],
              ...(evidence.validAt ? [["validAt", evidence.validAt]] : []),
              ["method", evidence.method],
              ["licence", evidence.licence],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{tKey(`shell.${label}`)}</dt>
                <dd>
                  {label === "observationTime" || label === "validAt"
                    ? readableEvidenceTime(value, language, tKey("shell.notRecorded"))
                    : value || tKey("shell.notRecorded")}
                </dd>
              </div>
            ))}
          </dl>
          <a
            href={evidence.href || "/?view=sources"}
            onClick={(event) => {
              if (!evidence.href || evidence.href.startsWith("/?")) {
                const target = new URL(
                  evidence.href || "/?view=sources",
                  window.location.origin,
                );
                const current = new URLSearchParams(window.location.search);
                for (const key of ["city", "date"]) {
                  if (current.has(key))
                    target.searchParams.set(key, current.get(key)!);
                }
                event.currentTarget.href = `${target.pathname}${target.search}`;
              }
            }}
            rel={evidence.href?.startsWith("http") ? "noreferrer" : undefined}
          >
            {tKey("shell.sourcePage")} →
          </a>
        </span>
      ) : null}
    </span>
  );
}

export function Sparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const points = values.filter(Number.isFinite);
  if (points.length < 3) return null;
  const min = Math.min(...points),
    span = Math.max(...points) - min || 1;
  const path = points
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * 160).toFixed(1)},${(36 - ((v - min) / span) * 30).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      className={styles.sparkline}
      viewBox="0 0 160 40"
      role="img"
      aria-label={label}
    >
      <path d={`${path} L160,40 L0,40 Z`} className={styles.sparkArea} />
      <path d={path} className={styles.sparkLine} />
    </svg>
  );
}

function CrossFadeText({ children }: { children: ReactNode }) {
  const id =
    typeof children === "string" || typeof children === "number"
      ? String(children)
      : null;
  const current = useRef(children);
  const [outgoing, setOutgoing] = useState<ReactNode>(null);

  useEffect(() => {
    if (id == null || Object.is(current.current, children)) return;
    setOutgoing(current.current);
    current.current = children;
  }, [children, id]);

  useEffect(() => {
    if (outgoing == null) return;
    const timer = window.setTimeout(() => setOutgoing(null), 120);
    return () => window.clearTimeout(timer);
  }, [outgoing]);

  if (id == null) return children;
  return (
    <span className={styles.crossfade}>
      {outgoing != null ? (
        <span aria-hidden="true" className={styles.crossfadeOut}>
          {outgoing}
        </span>
      ) : null}
      <span className={outgoing != null ? styles.crossfadeIn : undefined}>
        {children}
      </span>
    </span>
  );
}

export function MetricTile({
  label,
  value,
  unit,
  trend = [],
  tone = "neutral",
  status,
  evidence,
  onSelect,
  onAsk,
  source,
  delta,
  note,
  trendLabel,
}: {
  label: string;
  value: ReactNode;
  unit?: string | null;
  trend?: number[];
  tone?: Tone;
  status?: string;
  evidence?: Evidence;
  onSelect?: () => void;
  onAsk?: () => void;
  source?: string;
  delta?: string;
  note?: string | null;
  trendLabel?: string;
}) {
  const { tKey } = useI18n();
  const numeric =
    typeof value === "string"
      ? value.match(/^([−+\-]?\d[\d.,]*)\s+(°C|c\/kWh|m\/s|hPa|%|m|MW|EUR)$/)
      : null;
  const quality =
    typeof value === "string" ? value.match(/\((\d\/\d)\)/) : null;
  const displayValue = numeric?.[1] ?? quality?.[1] ?? value;
  const displayUnit = unit ?? numeric?.[2];
  const reading = <CrossFadeText>{displayValue}</CrossFadeText>;
  return (
    <article className={styles.metric} data-tone={tone}>
      <div className={styles.metricLabel}>
        {onSelect ? (
          <button type="button" onClick={onSelect}>
            {label}
            <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <span>{label}</span>
        )}
      </div>
      <div className={styles.metricValue}>
        {evidence ? (
          <EvidencePopover evidence={evidence}>
            <strong>{reading}</strong>
            {displayUnit ? <small>{displayUnit}</small> : null}
          </EvidencePopover>
        ) : (
          <>
            <strong>{reading}</strong>
            {displayUnit ? <small>{displayUnit}</small> : null}
          </>
        )}
      </div>
      <div className={styles.metricTrend}>
        {trend.filter(Number.isFinite).length >= 3 ? (
          <Sparkline
            values={trend}
            label={`${label} ${trendLabel ?? tKey("shell.trend24h")}`}
          />
        ) : (
          <span className={styles.noTrend}>{note || tKey("shell.noTrend")}</span>
        )}
        {delta ? (
          <small title={tKey("shell.versusFirst")}>{delta}</small>
        ) : null}
      </div>
      <footer className={styles.metricFooter}>
        {onAsk ? (
          <button
            className={styles.metricAsk}
            aria-label={`${tKey("shell.askAboutThis")}: ${label}`}
            type="button"
            onClick={() => onAsk()}
          >
            {tKey("shell.ask")}
          </button>
        ) : null}
        <span>{source}</span>
        {status ? <StatusBadge tone={tone}>{status}</StatusBadge> : null}
      </footer>
    </article>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty} role="status">
      <MaterialIcon name="database" />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export type Column<T> = {
  key: string;
  label: string;
  hideLabel?: boolean;
  numeric?: boolean;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
};
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  label,
  empty,
  onRowClick,
  rowTone,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  label: string;
  empty: string;
  onRowClick?: (row: T) => void;
  rowTone?: (row: T) => string | undefined;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const column = columns.find((c) => c.key === sort?.key);
  const sorted = column?.sortValue
    ? [...rows].sort((a, b) => {
        const av = column.sortValue!(a),
          bv = column.sortValue!(b);
        const comparison =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return comparison * (sort?.desc ? -1 : 1);
      })
    : rows;
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                data-numeric={c.numeric || undefined}
                aria-sort={
                  sort?.key === c.key
                    ? sort.desc
                      ? "descending"
                      : "ascending"
                    : undefined
                }
              >
                {c.sortValue ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSort({
                        key: c.key,
                        desc: sort?.key === c.key && !sort.desc,
                      })
                    }
                  >
                    {c.hideLabel ? <span className={styles.srOnly}>{c.label}</span> : c.label}
                    <span aria-hidden="true">↕</span>
                  </button>
                ) : c.hideLabel ? (
                  <span className={styles.srOnly}>{c.label}</span>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              data-tone={rowTone?.(row)}
              tabIndex={0}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const next =
                    event.key === "ArrowDown"
                      ? event.currentTarget.nextElementSibling
                      : event.currentTarget.previousElementSibling;
                  (next as HTMLElement | null)?.focus();
                }
                if (event.key === "Enter") onRowClick?.(row);
              }}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.label}
                  data-numeric={c.numeric || undefined}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <EmptyState title={empty} /> : null}
    </div>
  );
}

export function ChartFrame({
  title,
  count,
  children,
  actions,
}: {
  title: string;
  count: number;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { tKey } = useI18n();
  return (
    <Card title={title} action={actions}>
      {count >= 3 ? (
        children
      ) : (
        <p className={styles.chartNotice} role="status">
          {tKey("shell.notEnoughHistory").replace("{count}", String(count))}
        </p>
      )}
    </Card>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return children ? (
    <div className={styles.toast} role="status">
      {children}
    </div>
  ) : null;
}

export function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { tKey } = useI18n();
  const wide = useMediaQuery("(min-width: 1280px)");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    returnRef.current = document.activeElement as HTMLElement;
    if (wide) dialog.show();
    else dialog.showModal();
    return () => {
      dialog.close();
      returnRef.current?.focus();
    };
  }, [open, wide]);
  return (
    <dialog
      className={styles.drawer}
      ref={dialogRef}
      aria-labelledby={id}
      onCancel={onClose}
      onKeyDown={(event) => {
        if (wide && event.key === "Escape") onClose();
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          type="button"
          aria-label={tKey("shell.close")}
          onClick={onClose}
        >
          <MaterialIcon name="close" />
        </button>
      </header>
      {open ? children : null}
    </dialog>
  );
}
