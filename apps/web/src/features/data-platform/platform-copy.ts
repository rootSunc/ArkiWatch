import { translateMessageKey, type LanguageMode } from "./i18n";

const PLATFORM_COPY_KEYS: Record<string, string> = {
  "Forecast and rain timing.": "weather.categoryDescription",
  "Station-level outdoor air quality.": "airQuality.categoryDescription",
  "Grid load and household price signals.": "energy.categoryDescription",
  "Public transport service alerts.": "transit.categoryDescription",
  "Hydrology and seasonal conditions.": "waterSnow.categoryDescription",
  "Public events and activities.": "linkedEvents.categoryDescription",
  "Public service locations and opening information.": "cityServices.categoryDescription",
  "Location context for public signals.": "geospatial.categoryDescription",
  "Regional coverage and context.": "regionalProfile.categoryDescription",
  "The example price curve is most favourable between 12:00 and 14:00.":
    "energy.examplePriceCurveDetail",
  "The example household price is lowest around noon.":
    "energy.exampleHouseholdPriceDetail",
  "The example household price window is most favourable between 12:00 and 14:00.":
    "energy.exampleHouseholdWindowDetail",
  "Mild and mostly clear, with a brief late-morning rain window.": "weather.demoSummary",
  "Static demo fixture; not a live forecast.": "weather.staticDemoForecastNote",
  "Raw observation": "weather.rawObservation",
  "Normalized forecast": "weather.normalizedForecast",
  "FMI forecast": "weather.fmiForecast",
  "Static demo layer": "weather.staticDemoLayer",
  "Good air quality across the example station network.": "airQuality.demoSummary",
  "Static demo fixture; not a live station reading.": "airQuality.staticDemoStationNote",
  "Normalized station readings": "airQuality.normalizedStationReadings",
  "Grid load is moderate in the example morning window.": "energy.systemSummary",
  "Static demo fixture; not a live market or grid reading.": "energy.staticDemoEnergyNote",
  "Normalized energy curve": "energy.normalizedEnergyCurve",
  "One example service alert may affect the westbound tram corridor.": "transit.demoSummary",
  "Westbound tram service is slower": "transit.demoAlertTitle",
  "Allow a few extra minutes during the morning peak.": "transit.demoAlertDescription",
  "Normalized transit alerts": "transit.normalizedTransitAlerts",
  "Static demo fixture; not a live service alert.": "transit.staticDemoTransitNote",
  "One example road-weather event is worth allowing extra space for.": "roadRail.demoSummary",
  "Wet road surface risk": "roadRail.demoIncidentTitle",
  "Road surfaces may be slippery after the rain window.": "roadRail.demoIncidentDescription",
  "Helsinki westbound": "roadRail.demoCorridor",
  "Helsinki westbound approach": "roadRail.demoIncidentLocation",
  "Normalized road events": "roadRail.normalizedRoadEvents",
  "Static demo fixture; not a live road event.": "roadRail.staticDemoRoadNote",
  "Static demo fixture": "shell.staticDemoFixture",
  "FMI (Finnish Meteorological Institute)": "weather.fmiProviderLabel",
  "HSY air quality": "airQuality.hsySourceLabel",
  "HSY Air Quality WFS": "airQuality.hsyWfsSourceLabel",
  "HSL GTFS-RT Service Alerts": "transit.hslSourceLabel",
  "Digitransit alerts": "transit.digitransitSourceLabel",
  "Digitraffic road events": "roadRail.digitrafficSourceLabel",
  "Finnish Environment Institute": "waterSnow.providerName",
};

export function localizedPlatformCopy(
  value: string | null | undefined,
  language: LanguageMode,
): string | null {
  if (!value) {
    return null;
  }

  const messageKey = PLATFORM_COPY_KEYS[value.trim()];
  return messageKey ? translateMessageKey(language, messageKey) : value;
}
