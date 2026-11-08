import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderForecastChart } from "./weather-detail-charts";
import type { ForecastChartConfig, ForecastChartPoint } from "./weather-detail-types";

const wind: ForecastChartConfig = {
  key: "wind",
  label: "WIND",
  fullLabelKey: "windAndGust",
  unit: " m/s",
  tone: "wind",
  kind: "dual-line",
  descriptionKey: "sustainedWindWithGustOverlay",
  pairedKey: "gust",
  pairedLabelKey: "gust",
};

function points(offset: number): ForecastChartPoint[] {
  return [1, 2, 3].map((value, index) => ({
    label: `0${index}:00`,
    sourceCount: 3,
    sourceIndex: index,
    timestamp: `2026-08-09T0${index}:00:00Z`,
    value: value + offset,
  }));
}

describe("forecast chart series", () => {
  it("draws the paired wind series as its own line", () => {
    const { container } = render(
      renderForecastChart(points(0), points(2), wind, (key) => key),
    );

    expect(container.querySelector(".weather-chart-line")).toBeInTheDocument();
    expect(container.querySelector(".weather-chart-line-secondary")).toBeInTheDocument();
  });
});
