import type { SVGProps } from "react";

type MaterialIconProps = {
  name: string;
  className?: string;
};

// The bundled font is intentionally a subset. Keep new icons from leaking
// their ligature names into the UI when a page asks for a glyph outside it.
const ICON_FALLBACKS: Record<string, string> = {
  arrow_forward: "chevron_right",
  arrow_outward: "open_in_new",
  cloud_off: "cloud",
  domain: "location_city",
  error: "warning",
  keyboard_arrow_left: "chevron_left",
  keyboard_arrow_right: "chevron_right",
  lightbulb: "info",
  manage_accounts: "visibility",
  person_alert: "warning",
  progress_activity: "sync",
  sparkles: "info",
  sync_problem: "sync",
  tune: "settings",
  grid_on: "grid_view",
};

function iconClassName(className?: string): string {
  return `material-icon${className ? ` ${className}` : ""}`;
}

function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      className={iconClassName(props.className)}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 3v11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M5 20h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

export function MaterialIcon({ name, className }: MaterialIconProps) {
  if (name === "download") {
    return <DownloadIcon className={className} />;
  }

  return (
    <span
      className={`material-icon material-symbols-outlined${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      {ICON_FALLBACKS[name] ?? name}
    </span>
  );
}
