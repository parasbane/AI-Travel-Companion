import type { Place, PlaceCoordinates } from "./types";

/** Leaflet-style southwest/northeast bounds. */
export interface CoordinateBounds {
  southWest: PlaceCoordinates;
  northEast: PlaceCoordinates;
}

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

/** True when a coordinate pair is finite and within valid geographic ranges. */
export function hasValidCoordinates(
  coords: PlaceCoordinates | null | undefined
): boolean {
  if (!coords) return false;
  const { latitude, longitude } = coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < LAT_MIN || latitude > LAT_MAX) return false;
  if (longitude < LNG_MIN || longitude > LNG_MAX) return false;
  return true;
}

/** Places that can be shown as map markers. */
export function getMappablePlaces(places: Place[]): Place[] {
  return places.filter((place) => hasValidCoordinates(place.coordinates));
}

/**
 * Bounding box for a set of places with valid coordinates.
 * Returns null when fewer than one mappable place exists.
 */
export function getBoundsFromPlaces(
  places: Place[]
): CoordinateBounds | null {
  const mappable = getMappablePlaces(places);
  if (mappable.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const place of mappable) {
    const { latitude, longitude } = place.coordinates;
    if (latitude < minLat) minLat = latitude;
    if (latitude > maxLat) maxLat = latitude;
    if (longitude < minLng) minLng = longitude;
    if (longitude > maxLng) maxLng = longitude;
  }

  return {
    southWest: { latitude: minLat, longitude: minLng },
    northEast: { latitude: maxLat, longitude: maxLng },
  };
}

/**
 * Sensible map center when fitting a destination:
 * 1) average of mappable place coordinates
 * 2) provided destination fallback
 * 3) null when nothing usable exists
 */
export function getFallbackMapCenter(
  places: Place[],
  destinationCenter?: PlaceCoordinates | null
): PlaceCoordinates | null {
  const mappable = getMappablePlaces(places);
  if (mappable.length > 0) {
    const sum = mappable.reduce(
      (acc, place) => {
        acc.latitude += place.coordinates.latitude;
        acc.longitude += place.coordinates.longitude;
        return acc;
      },
      { latitude: 0, longitude: 0 }
    );
    return {
      latitude: sum.latitude / mappable.length,
      longitude: sum.longitude / mappable.length,
    };
  }

  if (hasValidCoordinates(destinationCenter)) {
    return {
      latitude: destinationCenter!.latitude,
      longitude: destinationCenter!.longitude,
    };
  }

  return null;
}

/** Default zoom when only a single point / fallback center is available. */
export const DEFAULT_MAP_ZOOM = 12;
