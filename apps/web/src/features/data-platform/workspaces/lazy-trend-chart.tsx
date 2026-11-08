"use client";

import dynamic from "next/dynamic";

import { useI18n } from "../i18n";

export type { TrendChartPoint } from "./trend-chart";

function TrendChartLoading() {
  const { tKey } = useI18n();

  return (
    <div aria-busy="true" className="trend-chart-empty" role="status">
      {tKey("shell.loadingChart")}
    </div>
  );
}

export const TrendChart = dynamic(
  () => import("./trend-chart").then((module) => module.TrendChart),
  {
    ssr: false,
    loading: () => <TrendChartLoading />,
  },
);
