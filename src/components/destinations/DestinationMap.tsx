"use client";

import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Place, PlaceCoordinates } from "@/lib/places/types";
import {
  DEFAULT_MAP_ZOOM,
  getBoundsFromPlaces,
  getFallbackMapCenter,
  getMappablePlaces,
  hasValidCoordinates,
} from "@/lib/places/coordinates";
import { getMapTileConfig } from "@/lib/maps/tileConfig";
import "leaflet/dist/leaflet.css";

export interface MapFocusRequest {
  placeId: string;
  nonce: number;
}

interface DestinationMapProps {
  places: Place[];
  selectedPlaceId: string | null;
  focusRequest?: MapFocusRequest | null;
  fallbackCenter?: PlaceCoordinates | null;
  onSelectPlace: (placeId: string) => void;
  className?: string;
}

function createMarkerIcon(selected: boolean): L.DivIcon {
  const size = selected ? 28 : 22;
  return L.divIcon({
    className: "ai-travel-map-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    html: `<span class="ai-travel-map-marker__pin${
      selected ? " ai-travel-map-marker__pin--selected" : ""
    }" aria-hidden="true"></span>`,
  });
}

function MapViewController({
  places,
  focusRequest,
  fallbackCenter,
}: {
  places: Place[];
  focusRequest?: MapFocusRequest | null;
  fallbackCenter?: PlaceCoordinates | null;
}) {
  const map = useMap();

  const placeIdsKey = useMemo(
    () =>
      getMappablePlaces(places)
        .map((p) => p.id)
        .sort()
        .join("|"),
    [places]
  );

  useEffect(() => {
    const mappable = getMappablePlaces(places);
    if (mappable.length >= 2) {
      const bounds = getBoundsFromPlaces(mappable);
      if (!bounds) return;
      map.fitBounds(
        [
          [bounds.southWest.latitude, bounds.southWest.longitude],
          [bounds.northEast.latitude, bounds.northEast.longitude],
        ],
        { padding: [36, 36], maxZoom: 14, animate: false }
      );
      return;
    }

    if (mappable.length === 1) {
      const { latitude, longitude } = mappable[0].coordinates;
      map.setView([latitude, longitude], DEFAULT_MAP_ZOOM, { animate: false });
      return;
    }

    const center = getFallbackMapCenter([], fallbackCenter);
    if (center) {
      map.setView([center.latitude, center.longitude], 10, { animate: false });
    }
    // placeIdsKey captures membership changes without depending on sort order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, placeIdsKey, fallbackCenter]);

  useEffect(() => {
    if (!focusRequest) return;
    const place = places.find((p) => p.id === focusRequest.placeId);
    if (!place || !hasValidCoordinates(place.coordinates)) return;
    map.flyTo(
      [place.coordinates.latitude, place.coordinates.longitude],
      Math.max(map.getZoom(), 14),
      { duration: 0.55 }
    );
  }, [focusRequest, map, places]);

  return null;
}

export default function DestinationMap({
  places,
  selectedPlaceId,
  focusRequest = null,
  fallbackCenter = null,
  onSelectPlace,
  className = "",
}: DestinationMapProps) {
  const tileConfig = useMemo(() => getMapTileConfig(), []);
  const mappablePlaces = useMemo(() => getMappablePlaces(places), [places]);

  const initialCenter = useMemo(() => {
    const center = getFallbackMapCenter(mappablePlaces, fallbackCenter);
    return center ?? { latitude: 20, longitude: 0 };
  }, [mappablePlaces, fallbackCenter]);

  const defaultIcon = useMemo(() => createMarkerIcon(false), []);
  const selectedIcon = useMemo(() => createMarkerIcon(true), []);

  if (mappablePlaces.length === 0) {
    return null;
  }

  return (
    <div className={`relative isolate z-0 h-full w-full overflow-hidden ${className}`}>
      <MapContainer
        center={[initialCenter.latitude, initialCenter.longitude]}
        zoom={DEFAULT_MAP_ZOOM}
        className="h-full w-full rounded-2xl"
        scrollWheelZoom
        attributionControl
      >
        <TileLayer
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          maxZoom={tileConfig.maxZoom}
        />
        <MapViewController
          places={mappablePlaces}
          focusRequest={focusRequest}
          fallbackCenter={fallbackCenter}
        />
        {mappablePlaces.map((place) => {
          const selected = place.id === selectedPlaceId;
          return (
            <Marker
              key={place.id}
              position={[
                place.coordinates.latitude,
                place.coordinates.longitude,
              ]}
              icon={selected ? selectedIcon : defaultIcon}
              eventHandlers={{
                click: () => onSelectPlace(place.id),
              }}
              title={place.name}
              alt={place.name}
              riseOnHover
              zIndexOffset={selected ? 1000 : 0}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
