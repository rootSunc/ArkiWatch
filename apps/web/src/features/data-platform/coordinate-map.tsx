"use client";

import type { LatLngBoundsExpression } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";

import "leaflet/dist/leaflet.css";

export type CoordinateMapTone = "good" | "warn" | "bad" | "neutral";

export type CoordinateMapPoint = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  popupDetail?: string;
  popupId?: string;
  tone: CoordinateMapTone;
  selected?: boolean;
};

export type CoordinateMapProps = {
  points: CoordinateMapPoint[];
  totalCount: number;
  emptyMessage: string;
  formatNumber: (value: number | null | undefined, maximumFractionDigits?: number) => string;
  mappedLabel: string;
  onPointClick?: (id: string) => void;
};

type ThemeMarkerColors = Record<CoordinateMapTone, string>;

const MARKER_RADIUS = 7;
const SELECTED_MARKER_RADIUS = 9;

const DEFAULT_MARKER_COLORS: ThemeMarkerColors = {
  good: "#2e7d32",
  warn: "#b26a00",
  bad: "#ba1a1a",
  neutral: "#5f6368"
};

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

function formatCoordinate(value: number, formatNumber: CoordinateMapProps["formatNumber"]): string {
  return `${formatNumber(value, 5)}°`;
}

type CoordinateMapMarkerProps = {
  point: CoordinateMapPoint;
  fillColor: string;
  formatNumber: CoordinateMapProps["formatNumber"];
  onPointClick?: CoordinateMapProps["onPointClick"];
};

function CoordinateMapMarker({ point, fillColor, formatNumber, onPointClick }: CoordinateMapMarkerProps) {
  const positionLabel = `${formatCoordinate(point.lat, formatNumber)}, ${formatCoordinate(point.lon, formatNumber)}`;
  const radius = point.selected ? SELECTED_MARKER_RADIUS : MARKER_RADIUS;

  return (
    <CircleMarker
      center={[point.lat, point.lon]}
      eventHandlers={
        onPointClick
          ? {
              click: () => {
                onPointClick(point.id);
              }
            }
          : undefined
      }
      pathOptions={{
        color: fillColor,
        fillColor,
        fillOpacity: 0.9,
        opacity: 0.95,
        weight: point.selected ? 3 : 2
      }}
      radius={radius}
    >
      <Tooltip
        className="air-map-station-tooltip"
        direction="top"
        offset={[0, -10]}
        opacity={1}
        permanent
      >
        <span className="air-map-station-tooltip-name">{point.title}</span>
        <span className="air-map-station-tooltip-coords">{positionLabel}</span>
      </Tooltip>
      <Popup className="air-map-station-popup" minWidth={200}>
        <div className="air-map-station-popup-body">
          <strong>{point.title}</strong>
          {point.popupId && point.popupId !== point.title ? (
            <span className="air-map-station-popup-id">{point.popupId}</span>
          ) : null}
          {point.popupDetail ? <span className="air-map-station-popup-quality">{point.popupDetail}</span> : null}
          <dl className="air-map-station-popup-coords">
            <div>
              <dt>lat</dt>
              <dd>{formatCoordinate(point.lat, formatNumber)}</dd>
            </div>
            <div>
              <dt>lon</dt>
              <dd>{formatCoordinate(point.lon, formatNumber)}</dd>
            </div>
          </dl>
        </div>
      </Popup>
    </CircleMarker>
  );
}

export function CoordinateMap({
  points,
  totalCount,
  emptyMessage,
  formatNumber,
  mappedLabel,
  onPointClick
}: CoordinateMapProps) {
  const [markerColors, setMarkerColors] = useState<ThemeMarkerColors>(DEFAULT_MARKER_COLORS);

  useEffect(() => {
    setMarkerColors(readThemeMarkerColors());
  }, []);

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (points.length === 0) {
      return null;
    }

    const latitudes = points.map((point) => point.lat);
    const longitudes = points.map((point) => point.lon);
    return [
      [Math.min(...latitudes), Math.min(...longitudes)],
      [Math.max(...latitudes), Math.max(...longitudes)]
    ];
  }, [points]);

  if (points.length === 0 || !bounds) {
    return <p>{emptyMessage}</p>;
  }

  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lon);
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
          {points.map((point) => (
            <CoordinateMapMarker
              fillColor={markerColors[point.tone]}
              formatNumber={formatNumber}
              key={point.id}
              onPointClick={onPointClick}
              point={point}
            />
          ))}
        </MapContainer>
      </div>
      <div className="air-map-meta">
        <span>
          {points.length}/{totalCount} {mappedLabel}
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
