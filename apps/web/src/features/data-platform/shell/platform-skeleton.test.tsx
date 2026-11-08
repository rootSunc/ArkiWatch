import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlatformSkeleton } from "./platform-skeleton";

describe("PlatformSkeleton", () => {
  it("exposes the localized loading label to assistive technology", () => {
    render(<PlatformSkeleton loadingLabel="正在加载数据平台" />);

    expect(screen.getByRole("status")).toHaveTextContent("正在加载数据平台");
  });

  it("does not claim the interactive main-content anchor", () => {
    render(<PlatformSkeleton />);

    expect(document.querySelectorAll('[id="main-content"]')).toHaveLength(0);
  });

  it("includes the mobile shell geometry in the loading state", () => {
    render(<PlatformSkeleton />);

    expect(document.querySelectorAll(".platform-skeleton-mobile-topbar")).toHaveLength(1);
    expect(document.querySelectorAll(".platform-skeleton-mobile-context")).toHaveLength(1);
    expect(document.querySelectorAll(".platform-skeleton-mobile-nav-item")).toHaveLength(5);
  });
});
