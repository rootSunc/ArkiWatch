import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MaterialIcon } from "./material-icon";

describe("MaterialIcon", () => {
  it("renders the download glyph without exposing its ligature name", () => {
    const { container } = render(<MaterialIcon name="download" />);

    expect(container.querySelector("svg.material-icon")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("download");
  });

  it("falls back to a bundled glyph for icons outside the subset font", () => {
    const { container } = render(<MaterialIcon name="sync_problem" />);

    expect(container.querySelector(".material-symbols-outlined")).toHaveTextContent("sync");
  });
});
