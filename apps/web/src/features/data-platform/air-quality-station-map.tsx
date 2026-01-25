"use client";

import type { LatLngBoundsExpression } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";

import "leaflet/dist/leaflet.css";

import { LanguageMode } from "./i18n";
import { normalizeStationCoordinates } from "./station-coordinates";
import { AirQualityStation } from "./types";

type AirTone = "good" | "warn" | "bad" | "neutral";

type AirQualityStationMapProps = {
  stations: AirQualityStation[];
  language: LanguageMode;
  t: (value: string) => string;
  scoreLabel: (
    score: number | null | undefined,
    fallback: string | null | undefined,
    language: LanguageMode,
    t: (value: string) => string
  ) => string;
  scoreTone: (score: number | null | undefined) => AirTone;
  stationDisplayName: (station: AirQualityStation) => string;
  formatNumber: (value: number | null | undefined, maximumFractionDigits?: number) => string;
};

type MappedStation = AirQualityStation & { lat: number; lon: number };

type ThemeMarkerColors = Record<AirTone, string>;

const SCORE_MARKER_RADIUS = 7;
const DEFAULT_MARKER_COLORS: ThemeMarkerColors = {
  good: "#2e7d32",
  warn: "#b26a00",
  bad: "#ba1a1a",
  neutral: "#5f6368"
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

function toMappedStation(station: AirQualityStation & { lat: number; lon: number }): MappedStation {
  const wgs84 = normalizeStationCoordinates(station.lat, station.lon);
  return { ...station, lat: wgs84.lat, lon: wgs84.lon };
}

function readThemeMarkerColors(): ThemeMarkerColors {
  if (typeof window === "undefined") {
    return DEFAULT_MARKER_COLORS;
  }

  const style = getComputedStyle(document.documentElement);
  const read = (token: string, fallback: string) => style.getPropertyValue(token).trim() || fallback;

  return {
    good: read("--success", DEFAULT_MARKER_COLORS.good),
    warn: read("--tertiary", DEFAULT_MARKER_COLORS.warn),
    bad: read("--error", DEFAULT_MARKER_COLORS.bad),
    neutral: read("--on-surface-variant", DEFAULT_MARKER_COLORS.neutral)
  };
}

function MapBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
  }, [bounds, map]);

  return null;
}

/** Enable scroll-wheel zoom only while the pointer is over the map. */
function ScrollWheelZoomOnHover() {
  const map = useMap();

  useEffect(() => {
    map.scrollWheelZoom.disable();
    const container = map.getContainer();

    const enableZoom = () => {
      map.scrollWheelZoom.enable();
    };
    const disableZoom = () => {
      map.scrollWheelZoom.disable();
    };

    container.addEventListener("mouseenter", enableZoom);
    container.addEventListener("mouseleave", disableZoom);

    return () => {
      container.removeEventListener("mouseenter", enableZoom);
      container.removeEventListener("mouseleave", disableZoom);
      map.scrollWheelZoom.disable();
    };
  }, [map]);

  return null;
}

type StationMapMarkerProps = {
  station: MappedStation;
  fillColor: string;
  language: LanguageMode;
  t: (value: string) => string;
  scoreLabel: AirQualityStationMapProps["scoreLabel"];
  stationDisplayName: AirQualityStationMapProps["stationDisplayName"];
  formatNumber: AirQualityStationMapProps["formatNumber"];
};

function formatCoordinate(value: number, formatNumber: StationMapMarkerProps["formatNumber"]): string {
  return `${formatNumber(value, 5)}°`;
}

function StationMapMarker({
  station,
  fillColor,
  language,
  t,
  scoreLabel,
  stationDisplayName,
  formatNumber
}: StationMapMarkerProps) {
  const name = stationDisplayName(station);
  const positionLabel = `${formatCoordinate(station.lat, formatNumber)}, ${formatCoordinate(station.lon, formatNumber)}`;
  const qualityLabel = scoreLabel(station.score, station.label, language, t);

  return (
    <CircleMarker
      center={[station.lat, station.lon]}
      pathOptions={{
        color: fillColor,
        fillColor,
        fillOpacity: 0.9,
        opacity: 0.95,
        weight: 2
      }}
      radius={SCORE_MARKER_RADIUS}
    >
      <Tooltip
        className="air-map-station-tooltip"
        direction="top"
        offset={[0, -10]}
        opacity={1}
        permanent
      >
        <span className="air-map-station-tooltip-name">{name}</span>
        <span className="air-map-station-tooltip-coords">{positionLabel}</span>
      </Tooltip>
      <Popup className="air-map-station-popup" minWidth={200}>
        <div className="air-map-station-popup-body">
          <strong>{name}</strong>
          {station.station && station.station !== name ? (
            <span className="air-map-station-popup-id">{station.station}</span>
          ) : null}
          <span className="air-map-station-popup-quality">{qualityLabel}</span>
          <dl className="air-map-station-popup-coords">
            <div>
              <dt>lat</dt>
              <dd>{formatCoordinate(station.lat, formatNumber)}</dd>
            </div>
            <div>
              <dt>lon</dt>
              <dd>{formatCoordinate(station.lon, formatNumber)}</dd>
            </div>
          </dl>
        </div>
      </Popup>
    </CircleMarker>
  );
}

export function AirQualityStationMap({
  stations,
  language,
  t,
  scoreLabel,
  scoreTone,
  stationDisplayName,
  formatNumber
}: AirQualityStationMapProps) {
  const mappedStations = useMemo(
    () => stations.filter(hasCoordinates).map(toMappedStation),
    [stations]
  );
  const [markerColors, setMarkerColors] = useState<ThemeMarkerColors>(DEFAULT_MARKER_COLORS);

  useEffect(() => {
    setMarkerColors(readThemeMarkerColors());
  }, []);

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (mappedStations.length === 0) {
      return null;
    }

    const latitudes = mappedStations.map((station) => station.lat);
    const longitudes = mappedStations.map((station) => station.lon);
    return [
      [Math.min(...latitudes), Math.min(...longitudes)],
      [Math.max(...latitudes), Math.max(...longitudes)]
    ];
  }, [mappedStations]);

  if (mappedStations.length === 0 || !bounds) {
    return <p>{t("No station coordinates were returned in the latest HSY payload.")}</p>;
  }

  const latitudes = mappedStations.map((station) => station.lat);
  const longitudes = mappedStations.map((station) => station.lon);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const center: [number, number] = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];

  return (
    <>
      <div className="air-map-frame air-map-frame--leaflet">
        <MapContainer center={center} className="air-map-leaflet" scrollWheelZoom zoom={10}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ScrollWheelZoomOnHover />
          <MapBounds bounds={bounds} />
          {mappedStations.map((station) => (
            <StationMapMarker
              fillColor={markerColors[scoreTone(station.score)]}
              formatNumber={formatNumber}
              key={station.station}
              language={language}
              scoreLabel={scoreLabel}
              station={station}
              stationDisplayName={stationDisplayName}
              t={t}
            />
          ))}
        </MapContainer>
      </div>
      <div className="air-map-meta">
        <span>
          {mappedStations.length}/{stations.length} {t("mapped")}
        </span>
        <span>
          {formatNumber(minLat, 3)}-{formatNumber(maxLat, 3)} lat
        </span>
        <span>
          {formatNumber(minLon, 3)}-{formatNumber(maxLon, 3)} lon
        </span>
      </div>
    </>
  );
}
