type AssistantGlyphProps = {
  className?: string;
};

/**
 * The Material Symbols bundle is intentionally a small subset. Keep the
 * assistant mark as SVG so a missing ligature can never leak its text name
 * into a compact toolbar button.
 */
export function AssistantGlyph({ className }: AssistantGlyphProps) {
  return (
    <svg
      aria-hidden="true"
      className={`assistant-glyph${className ? ` ${className}` : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 4.75h14A1.75 1.75 0 0 1 20.75 6.5v9A1.75 1.75 0 0 1 19 17.25H9l-5.75 3V6.5A1.75 1.75 0 0 1 5 4.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 9h9M7.5 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
