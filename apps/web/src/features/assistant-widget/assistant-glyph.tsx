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
        d="M8.25 8.25h7.5A3.25 3.25 0 0 1 19 11.5v4.25A3.25 3.25 0 0 1 15.75 19h-7.5A3.25 3.25 0 0 1 5 15.75V11.5a3.25 3.25 0 0 1 3.25-3.25Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M12 8.25V5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M12 5.5h1.75" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <circle cx="9" cy="13" fill="currentColor" r="1" />
      <circle cx="15" cy="13" fill="currentColor" r="1" />
      <path d="M9.25 16h5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M5 12.25H3.75M20.25 12.25H19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  );
}
