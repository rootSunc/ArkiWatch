import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssistantGlyph } from "./assistant-glyph";

describe("AssistantGlyph", () => {
  it("renders a self-contained accessible decoration", () => {
    const { container } = render(<AssistantGlyph />);
    const glyph = container.querySelector("svg");

    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(glyph).toHaveAttribute("viewBox", "0 0 24 24");
    expect(glyph).toHaveClass("assistant-glyph");
  });
});
