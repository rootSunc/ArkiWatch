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
            { label: "8月8日", value: 16 },
            { label: "8月9日", value: 19 },
          ]}
          unit="C"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("img", { name: "温度: 16 C 至 19 C" })).toBeInTheDocument();
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

    expect(screen.getByText("目前只有一个已保存快照，至少需要两次观测才能显示趋势。")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "温度: 19 C" })).toBeInTheDocument();
  });
});
