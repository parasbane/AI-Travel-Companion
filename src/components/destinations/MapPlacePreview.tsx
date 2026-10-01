"use client";

import React from "react";
import type { Place } from "@/lib/places/types";
import { Button } from "@/components/ui/Button";

interface MapPlacePreviewProps {
  place: Place;
  onViewDetails: (place: Place) => void;
  onDismiss?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  culture: "Culture",
  food: "Food & Dining",
  nature: "Nature",
  adventure: "Adventure",
  relaxation: "Relaxation",
  nightlife: "Nightlife",
  attractions: "Landmarks",
};

export default function MapPlacePreview({
  place,
  onViewDetails,
  onDismiss,
}: MapPlacePreviewProps) {
  return (
    <div
      className="rounded-2xl border border-zinc-200 bg-white/95 p-3.5 shadow-sm backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95"
      role="region"
      aria-label={`Selected place: ${place.name}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {CATEGORY_LABELS[place.category] ?? place.category}
              </p>
              <h3 className="truncate text-sm font-bold text-zinc-900 dark:text-white">
                {place.name}
              </h3>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <span aria-hidden="true">★</span>
              <span>{place.rating.toFixed(1)}</span>
            </div>
          </div>

          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {place.shortDescription || place.description}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => onViewDetails(place)}
              aria-label={`View details for ${place.name}`}
            >
              View details
            </Button>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
