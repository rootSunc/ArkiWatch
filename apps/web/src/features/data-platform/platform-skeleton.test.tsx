import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlatformSkeleton } from "./platform-skeleton";

describe("PlatformSkeleton", () => {
  it("exposes the localized loading label to assistive technology", () => {
    render(<PlatformSkeleton loadingLabel="正在加载数据平台" />);

    expect(screen.getByRole("status")).toHaveTextContent("正在加载数据平台");
  });
});
