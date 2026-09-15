"use client";

import { useMemo } from "react";

import { CoordinateMap, CoordinateMapPoint } from "./coordinate-map";
import { LanguageMode } from "./i18n";
import { normalizeStationCoordinates } from "./station-coordinates";
import { AirQualityStation } from "./types";

type AirTone = "good" | "warn" | "bad" | "neutral";

type AirQualityStationMapProps = {
  stations: AirQualityStation[];
  language: LanguageMode;
  tKey: (key: string) => string;
  dataLabel: (value: string | null | undefined) => string;
  scoreLabel: (
    score: number | null | undefined,
    fallback: string | null | undefined,
    language: LanguageMode,
    tKey: (key: string) => string,
    dataLabel: (value: string | null | undefined) => string
  ) => string;
  stationDisplayName: (station: AirQualityStation) => string;
  formatNumber: (value: number | null | undefined, maximumFractionDigits?: number) => string;
};

function hasCoordinates(station: AirQualityStation): station is AirQualityStation & {
  lat: number;
  lon: number;
} {
  return (
    station.lat !== null &&
    station.lat !== undefined &&
    !Number.isNaN(station.lat) &&
    station.lon !== null &&
    station.lon !== undefined &&
    !Number.isNaN(station.lon)
  );
}

export function AirQualityStationMap({
  stations,
  language,
  tKey,
  dataLabel,
  scoreLabel,
  stationDisplayName,
  formatNumber
}: AirQualityStationMapProps) {
  const points = useMemo<CoordinateMapPoint[]>(
    () =>
      stations.filter(hasCoordinates).map((station) => {
        const wgs84 = normalizeStationCoordinates(station.lat, station.lon);
        const title = stationDisplayName(station);

        return {
          id: station.station,
          lat: wgs84.lat,
          lon: wgs84.lon,
          title,
          popupDetail: scoreLabel(station.score, station.label, language, tKey, dataLabel),
          popupId: station.station !== title ? station.station : undefined,
          tone: (station.tone ?? "neutral") as AirTone
        };
      }),
    [dataLabel, language, scoreLabel, stationDisplayName, stations, tKey]
  );

  return (
    <CoordinateMap
      emptyMessage={tKey("airQuality.noStationCoordinatesWereReturnedInTheLatestHsyPayload")}
      formatNumber={formatNumber}
      latitudeLabel={tKey("shell.latitude")}
      longitudeLabel={tKey("shell.longitude")}
      points={points}
      mappedLabel={tKey("shell.mapped")}
      totalCount={stations.length}
    />
  );
}
