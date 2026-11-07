import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "./i18n";
import { TrendChart } from "./trend-chart";

describe("TrendChart", () => {
  it("localizes the accessible value range", () => {
    render(
      <I18nProvider language="zh">
        <TrendChart
          eyebrow="历史"
          title="温度"
          points={[
            { label: "8月7日", value: 17 },
            { label: "8月8日", value: 16 },
            { label: "8月9日", value: 19 },
          ]}
          unit="C"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("img", { name: "温度: 16 C 至 19 C" })).toBeInTheDocument();
  });

  it("positions irregular daily samples by elapsed time rather than array index", () => {
    const { container } = render(<I18nProvider language="en"><TrendChart eyebrow="History" title="Temperature" points={[{ label: "2026-08-01", value: 1 }, { label: "2026-08-02", value: 2 }, { label: "2026-08-08", value: 3 }]} /></I18nProvider>);
    const dots = Array.from(container.querySelectorAll("circle")).map((dot) => Number(dot.getAttribute("cx")));
    expect((dots[1] - dots[0]) / (dots[2] - dots[0])).toBeCloseTo(1 / 7);
  });

  it("localizes the default empty historical state", () => {
    render(
      <I18nProvider language="zh">
        <TrendChart eyebrow="历史" title="温度" points={[]} />
      </I18nProvider>,
    );

    expect(screen.getByText("暂无可用的历史图表数据。")).toBeInTheDocument();
    expect(screen.queryByText("No historical chart data is available.")).not.toBeInTheDocument();
  });

  it("explains when a single snapshot cannot form a trend", () => {
    render(
      <I18nProvider language="zh">
        <TrendChart eyebrow="历史" title="温度" points={[{ label: "8月9日", value: 19 }]} unit="C" />
      </I18nProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("历史记录不足——当前范围有 1 个观测点，至少需要 3 个。");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("observation threshold", () => {
  it.each([0, 1, 2])("does not draw a chart for %i finite observations", (count) => {
    render(<I18nProvider language="en"><TrendChart eyebrow="History" title="Temperature" points={[...Array.from({ length: count }, (_, i) => ({ label: String(i), value: i })), { label: "invalid", value: NaN }]} /></I18nProvider>);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(`${count} of 3 observations`);
  });
});
