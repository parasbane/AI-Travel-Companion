/**
 * Public tile configuration for destination maps.
 * Defaults to OpenStreetMap — no API key required.
 * Optional NEXT_PUBLIC_* overrides are inherently client-visible (not secrets).
 */

export interface MapTileConfig {
  url: string;
  attribution: string;
  maxZoom: number;
}

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function getMapTileConfig(): MapTileConfig {
  const url =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim()) ||
    OSM_TILE_URL;

  const attribution =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim()) ||
    OSM_ATTRIBUTION;

  return {
    url,
    attribution,
    maxZoom: 19,
  };
}
