import type {
  PlatformCategory,
  PlatformHistoricalSnapshot,
  WeatherForecastResponse,
} from "../../types";
import type { ScopedEventState } from "../../model/event-time-state";

export type WeatherDetailViewProps = {
  category: PlatformCategory | null;
  highlightedEventId?: string | null;
  history: PlatformHistoricalSnapshot<WeatherForecastResponse>[];
  weather: WeatherForecastResponse | null;
};

export type ChartMode =
  | "temperature"
  | "precipitation"
  | "wind"
  | "gust"
  | "cloud"
  | "humidity"
  | "dewPoint"
  | "pressure"
  | "visibility";

export type TimelineItem = {
  id: string;
  time: string;
  title: string;
  body: string;
  tone: "good" | "warn" | "bad" | "neutral";
  active: boolean;
  state?: ScopedEventState;
};

export type CurrentMetricCard = {
  key: string;
  icon: string;
  label: string;
  value: string;
  unit: string;
  detail: string;
  progress: number;
  tone: string;
};

export type ForecastChartKind = "line" | "bar" | "area" | "band" | "dual-line";
export type ForecastChartTone = "primary" | "rain" | "wind" | "cloud" | "humidity" | "pressure" | "visibility";

export type ForecastChartConfig = {
  key: ChartMode;
  label: string;
  fullLabelKey: string;
  unit: string;
  tone: ForecastChartTone;
  kind: ForecastChartKind;
  descriptionKey: string;
  floorZero?: boolean;
  fixedMin?: number;
  fixedMax?: number;
  pairedKey?: ChartMode;
  pairedLabelKey?: string;
};

export type ForecastChartPoint = {
  label: string;
  sourceCount: number;
  sourceIndex: number;
  timestamp: string;
  value: number;
};

export type ForecastChartScale = {
  min: number;
  max: number;
};
