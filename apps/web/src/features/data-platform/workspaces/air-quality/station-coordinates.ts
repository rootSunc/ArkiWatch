import proj4 from "proj4";

/** HSY WFS returns ETRS-TM35FIN (EPSG:3879) easting/northing in GeoJSON coordinates. */
const ETRS_TM35FIN =
  "+proj=tmerc +lat_0=0 +lon_0=25 +k=1 +x_0=25500000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const WGS84 = "EPSG:4326";

proj4.defs("ETRS-TM35FIN", ETRS_TM35FIN);

export type Wgs84Coordinates = {
  lat: number;
  lon: number;
};

function looksLikeProjectedCoordinate(lat: number, lon: number): boolean {
  return Math.max(Math.abs(lat), Math.abs(lon)) > 180;
}

/**
 * Normalize station lat/lon to WGS84 degrees.
 * Handles legacy API payloads that stored northing/easting in lat/lon fields.
 */
export function normalizeStationCoordinates(lat: number, lon: number): Wgs84Coordinates {
  if (!looksLikeProjectedCoordinate(lat, lon)) {
    return { lat, lon };
  }

  const [wgsLon, wgsLat] = proj4("ETRS-TM35FIN", WGS84, [lon, lat]);
  return { lat: wgsLat, lon: wgsLon };
}
