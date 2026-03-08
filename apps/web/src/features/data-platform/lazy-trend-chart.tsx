"use client";

import dynamic from "next/dynamic";

export type { TrendChartPoint } from "./trend-chart";

export const TrendChart = dynamic(
  () => import("./trend-chart").then((module) => module.TrendChart),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden="true" className="trend-chart-empty">
        Loading chart…
      </div>
    ),
  },
);
