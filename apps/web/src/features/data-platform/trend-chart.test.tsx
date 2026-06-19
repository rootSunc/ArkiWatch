import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "./i18n";
import { TrendChart } from "./trend-chart";

describe("TrendChart", () => {
  it("localizes the default empty historical state", () => {
    render(
      <I18nProvider language="zh">
        <TrendChart eyebrow="历史" title="温度" points={[]} />
      </I18nProvider>,
    );

    expect(screen.getByText("暂无可用的历史图表数据。")).toBeInTheDocument();
    expect(screen.queryByText("No historical chart data is available.")).not.toBeInTheDocument();
  });
});
