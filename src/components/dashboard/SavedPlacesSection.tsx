"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SavedPlace } from "@/lib/saved/types";
import { useSavedPlaces } from "@/context/SavedPlacesContext";
import PlaceCardSkeleton from "@/components/destinations/PlaceCardSkeleton";
import { slugToTitle } from "@/lib/utils/slug";

const CATEGORY_COLORS: Record<string, string> = {
  culture: "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300",
  food: "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300",
  nature: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300",
  adventure: "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300",
  relaxation: "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300",
  nightlife: "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300",
  attractions: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300",
};

const REMOVE_ERROR_MS = 3000;

function priceLabel(level: string | null | undefined): string {
  switch (level) {
    case "free":
      return "Free";
    case "budget":
      return "$";
    case "moderate":
      return "$$";
    case "expensive":
      return "$$$";
    default:
      return "";
  }
}

interface SavedPlacesSectionProps {
  className?: string;
}

export default function SavedPlacesSection({ className = "" }: SavedPlacesSectionProps) {
  const { savedPlaces, isLoading, removeSavedPlace } = useSavedPlaces();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const removingRef = useRef<Set<string>>(new Set());
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, []);

  const showError = useCallback((text: string) => {
    setErrorMessage(text);
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = setTimeout(() => setErrorMessage(null), REMOVE_ERROR_MS);
  }, []);

  const handleRemove = useCallback(
    async (saved: SavedPlace) => {
      if (removingRef.current.has(saved.placeId)) return;
      removingRef.current.add(saved.placeId);
      try {
        const ok = await removeSavedPlace(saved.placeId);
        if (!ok) {
          showError("Could not remove this place. Please try again.");
        }
      } finally {
        removingRef.current.delete(saved.placeId);
      }
    },
    [removeSavedPlace, showError]
  );

  return (
    <section
      className={`rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      aria-labelledby="saved-places-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </div>
        <h2 id="saved-places-heading" className="text-xl font-bold text-zinc-900 dark:text-white">
          Saved Places
        </h2>
        {!isLoading && savedPlaces.length > 0 && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            {savedPlaces.length}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Highlights you bookmarked while exploring destinations.
      </p>

      {errorMessage && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 animate-fadeIn"
        >
          {errorMessage}
        </p>
      )}

      {isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <PlaceCardSkeleton key={idx} />
          ))}
        </div>
      ) : savedPlaces.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-200 p-8 text-center sm:p-10 dark:border-zinc-800 animate-fadeIn">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl text-zinc-500 dark:bg-zinc-800">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
            No saved places yet
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Tap the bookmark on any highlight card while exploring a destination and it will show up here for quick planning.
          </p>
          <Link
            href="/#explore"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Explore destinations
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {savedPlaces.map((saved) => {
            const price = priceLabel(saved.placePriceLevel);
            const categoryColor =
              CATEGORY_COLORS[saved.placeCategory] || "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";

            return (
              <article
                key={saved.id}
                className="group flex flex-col overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  {saved.placeImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={saved.placeImageUrl}
                      alt={saved.placeName}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-300 dark:text-zinc-600">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />

                  <span
                    className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm ${categoryColor}`}
                  >
                    {saved.placeCategory}
                  </span>

                  {price && (
                    <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                      {price}
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white line-clamp-1">
                      {saved.placeName}
                    </h3>
                    {saved.placeRating != null && (
                      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                        <svg className="h-3.5 w-3.5 fill-amber-400" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span>{saved.placeRating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                  <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                    {slugToTitle(saved.destinationSlug)}
                  </p>

                  {saved.placeAddress && (
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 line-clamp-1">
                      {saved.placeAddress}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-zinc-100 p-4 pt-3 dark:border-zinc-800/80">
                  <span className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                    {saved.placeAddress || slugToTitle(saved.destinationSlug)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRemove(saved)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-rose-600 transition-colors hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-400 dark:hover:text-rose-300"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}