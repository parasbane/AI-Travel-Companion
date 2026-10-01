"use client";

import React, { Component, type ErrorInfo, type ReactNode, useMemo } from "react";
import dynamic from "next/dynamic";
import type { Place, PlaceCoordinates } from "@/lib/places/types";
import { getMappablePlaces } from "@/lib/places/coordinates";
import type { MapFocusRequest } from "./DestinationMap";
import MapPlacePreview from "./MapPlacePreview";
import DestinationMapSkeleton from "./DestinationMapSkeleton";

const DestinationMap = dynamic(() => import("./DestinationMap"), {
  ssr: false,
  loading: () => <DestinationMapSkeleton />,
});

interface DestinationMapSectionProps {
  places: Place[];
  selectedPlaceId: string | null;
  focusRequest?: MapFocusRequest | null;
  fallbackCenter?: PlaceCoordinates | null;
  onSelectPlace: (placeId: string) => void;
  onViewDetails: (place: Place) => void;
  onClearSelection?: () => void;
}

interface MapErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
}

class MapErrorBoundary extends Component<
  MapErrorBoundaryProps,
  MapErrorBoundaryState
> {
  state: MapErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Destination map failed to render:", error, info);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function MapFallback({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-[240px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center dark:border-zinc-700 dark:bg-zinc-900/60 sm:h-[300px] lg:h-[380px]">
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        {title}
      </p>
      <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </div>
  );
}

export default function DestinationMapSection({
  places,
  selectedPlaceId,
  focusRequest = null,
  fallbackCenter = null,
  onSelectPlace,
  onViewDetails,
  onClearSelection,
}: DestinationMapSectionProps) {
  const mappablePlaces = useMemo(() => getMappablePlaces(places), [places]);
  const selectedPlace = useMemo(
    () => mappablePlaces.find((p) => p.id === selectedPlaceId) ?? null,
    [mappablePlaces, selectedPlaceId]
  );

  const markerCount = mappablePlaces.length;

  return (
    <section
      className="mx-auto max-w-7xl px-4 pt-6 pb-6 sm:px-6 lg:px-8"
      aria-labelledby="destination-map-heading"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="destination-map-heading"
            className="text-base font-bold tracking-tight text-zinc-900 dark:text-white sm:text-lg"
          >
            Explore on the map
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
            Select a marker for a quick preview — full details stay in the place cards below.
          </p>
        </div>
        <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
          {markerCount} {markerCount === 1 ? "pin" : "pins"}
        </p>
      </div>

      <MapErrorBoundary
        fallback={
          <MapFallback
            title="Map unavailable"
            description="The interactive map could not be loaded. You can still browse every place in the list below."
          />
        }
      >
        {places.length === 0 ? (
          <MapFallback
            title="No places to show"
            description="Adjust your filters to see places on the map and in the list."
          />
        ) : markerCount === 0 ? (
          <MapFallback
            title="Map locations unavailable"
            description="These places do not have valid map coordinates yet. Browse them in the cards below."
          />
        ) : (
          <div className="space-y-3">
            <div className="h-[240px] overflow-hidden rounded-2xl border border-zinc-200 shadow-sm dark:border-zinc-800 sm:h-[300px] lg:h-[380px]">
              <DestinationMap
                places={mappablePlaces}
                selectedPlaceId={selectedPlaceId}
                focusRequest={focusRequest}
                fallbackCenter={fallbackCenter}
                onSelectPlace={onSelectPlace}
              />
            </div>

            {selectedPlace && (
              <MapPlacePreview
                place={selectedPlace}
                onViewDetails={onViewDetails}
                onDismiss={onClearSelection}
              />
            )}
          </div>
        )}
      </MapErrorBoundary>
    </section>
  );
}
