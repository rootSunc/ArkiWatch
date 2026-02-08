"use client";

import { useMemo } from "react";

import { severityTone } from "@/features/shared/format";

import { CoordinateMap, CoordinateMapPoint, CoordinateMapTone } from "./coordinate-map";
import { PlatformEvent } from "./types";

type LinkedEventsCoordinateMapProps = {
  events: PlatformEvent[];
  selectedEventId: string | null;
  formatNumber: (value: number | null | undefined, maximumFractionDigits?: number) => string;
  placeLabel: (event: PlatformEvent) => string;
  t: (value: string) => string;
  onEventSelect: (eventId: string) => void;
};

function attributeNumber(event: PlatformEvent, key: string): number | null {
  const value = event.attributes?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function hasCoordinates(event: PlatformEvent): boolean {
  const lat = attributeNumber(event, "latitude");
  const lon = attributeNumber(event, "longitude");
  return lat !== null && lon !== null;
}

function eventTone(event: PlatformEvent): CoordinateMapTone {
  return severityTone(event.severity) as CoordinateMapTone;
}

export function LinkedEventsCoordinateMap({
  events,
  selectedEventId,
  formatNumber,
  placeLabel,
  t,
  onEventSelect
}: LinkedEventsCoordinateMapProps) {
  const points = useMemo<CoordinateMapPoint[]>(
    () =>
      events
        .filter(hasCoordinates)
        .map((event) => {
          const lat = attributeNumber(event, "latitude") as number;
          const lon = attributeNumber(event, "longitude") as number;

          return {
            id: event.id,
            lat,
            lon,
            title: event.title,
            popupDetail: placeLabel(event),
            tone: eventTone(event),
            selected: event.id === selectedEventId
          };
        }),
    [events, placeLabel, selectedEventId]
  );

  return (
    <CoordinateMap
      emptyMessage={t("No event coordinates were returned in the latest Linked Events payload.")}
      formatNumber={formatNumber}
      onPointClick={onEventSelect}
      points={points}
      t={t}
      totalCount={events.length}
    />
  );
}
