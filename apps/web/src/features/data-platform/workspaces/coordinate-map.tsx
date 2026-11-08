"use client";

import L, { type LatLngBoundsExpression, type Map as LeafletMap } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";

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
  latitudeLabel?: string;
  longitudeLabel?: string;
  onPointClick?: (id: string) => void;
};

type ThemeMarkerColors = Record<CoordinateMapTone, string>;

const MARKER_RADIUS = 7;
const SELECTED_MARKER_RADIUS = 9;

function readThemeMarkerColors(): ThemeMarkerColors {
  const style = getComputedStyle(document.documentElement);
  const read = (token: string) => style.getPropertyValue(token).trim();

  return {
    good: read("--success"),
    warn: read("--tertiary"),
    bad: read("--error"),
    neutral: read("--on-surface-variant")
  };
}

function formatCoordinate(value: number, formatNumber: CoordinateMapProps["formatNumber"]): string {
  return `${formatNumber(value, 5)}°`;
}

function appendTextElement(parent: HTMLElement, tagName: keyof HTMLElementTagNameMap, className: string, text: string) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function createTooltipContent(point: CoordinateMapPoint, formatNumber: CoordinateMapProps["formatNumber"]): HTMLElement {
  const content = document.createElement("div");
  appendTextElement(content, "span", "air-map-station-tooltip-name", point.title);
  appendTextElement(
    content,
    "span",
    "air-map-station-tooltip-coords",
    formatCoordinate(point.lat, formatNumber) + ", " + formatCoordinate(point.lon, formatNumber)
  );
  return content;
}

function createPopupContent(
  point: CoordinateMapPoint,
  formatNumber: CoordinateMapProps["formatNumber"],
  latitudeLabel: string,
  longitudeLabel: string
): HTMLElement {
  const content = document.createElement("div");
  content.className = "air-map-station-popup-body";
  appendTextElement(content, "strong", "", point.title);

  if (point.popupId && point.popupId !== point.title) {
    appendTextElement(content, "span", "air-map-station-popup-id", point.popupId);
  }
  if (point.popupDetail) {
    appendTextElement(content, "span", "air-map-station-popup-quality", point.popupDetail);
  }

  const coordinates = document.createElement("dl");
  coordinates.className = "air-map-station-popup-coords";
  for (const [label, value] of [
    [latitudeLabel, formatCoordinate(point.lat, formatNumber)],
    [longitudeLabel, formatCoordinate(point.lon, formatNumber)]
  ]) {
    const row = document.createElement("div");
    appendTextElement(row, "dt", "", label);
    appendTextElement(row, "dd", "", value);
    coordinates.append(row);
  }
  content.append(coordinates);
  return content;
}

export function CoordinateMap({
  points,
  totalCount,
  emptyMessage,
  formatNumber,
  mappedLabel,
  latitudeLabel = "Latitude",
  longitudeLabel = "Longitude",
  onPointClick
}: CoordinateMapProps) {
  const [markerColors, setMarkerColors] = useState<ThemeMarkerColors | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const updateMarkerColors = () => setMarkerColors(readThemeMarkerColors());
    updateMarkerColors();
    const observer = new MutationObserver(updateMarkerColors);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
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

  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lon);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const center: [number, number] = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
  const hasMapPoints = bounds !== null;

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || !hasMapPoints || mapRef.current) {
      return;
    }

    const map = L.map(container, { scrollWheelZoom: false }).setView(center, 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    const enableZoom = () => map.scrollWheelZoom.enable();
    const disableZoom = () => map.scrollWheelZoom.disable();
    container.addEventListener("mouseenter", enableZoom);
    container.addEventListener("mouseleave", disableZoom);

    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      container.removeEventListener("mouseenter", enableZoom);
      container.removeEventListener("mouseleave", disableZoom);
      layerGroupRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // The map instance is intentionally created once for each mounted container.
    // Bounds and markers are updated by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMapPoints]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup || !bounds || !markerColors) {
      return;
    }

    layerGroup.clearLayers();
    points.forEach((point) => {
      const fillColor = markerColors[point.tone];
      const marker = L.circleMarker([point.lat, point.lon], {
        color: fillColor,
        fillColor,
        fillOpacity: 0.9,
        opacity: 0.95,
        radius: point.selected ? SELECTED_MARKER_RADIUS : MARKER_RADIUS,
        weight: point.selected ? 3 : 2
      });
      marker.bindTooltip(createTooltipContent(point, formatNumber), {
        className: "air-map-station-tooltip",
        direction: "top",
        offset: [0, -10],
        opacity: 1,
        permanent: true
      });
      marker.bindPopup(createPopupContent(point, formatNumber, latitudeLabel, longitudeLabel), {
        className: "air-map-station-popup",
        minWidth: 200
      });
      if (onPointClick) {
        marker.on("click", () => onPointClick(point.id));
      }
      marker.addTo(layerGroup);
    });

    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
  }, [bounds, formatNumber, latitudeLabel, longitudeLabel, markerColors, onPointClick, points]);

  if (points.length === 0 || !bounds) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <>
      <div className="air-map-frame air-map-frame--leaflet">
        <div className="air-map-leaflet" ref={mapContainerRef} />
      </div>
      <div className="air-map-meta">
        <span>
          {points.length}/{totalCount} {mappedLabel}
        </span>
        <span>
          {formatNumber(minLat, 3)}-{formatNumber(maxLat, 3)} {latitudeLabel}
        </span>
        <span>
          {formatNumber(minLon, 3)}-{formatNumber(maxLon, 3)} {longitudeLabel}
        </span>
      </div>
    </>
  );
}
