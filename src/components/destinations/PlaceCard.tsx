"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/places/types";
import { useAuth } from "@/context/AuthContext";
import { useSavedPlaces } from "@/context/SavedPlacesContext";
import { buildSavePlaceInput } from "@/lib/saved/placeToSaveInput";
import { resolveSavedToggleOutcome } from "@/lib/saved/toggleOutcome";

interface PlaceCardProps {
  place: Place;
  onClick: (place: Place) => void;
  onToggleSave?: (place: Place, saved: boolean) => void;
  isSelected?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  culture: "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300",
  food: "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300",
  nature: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300",
  adventure: "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300",
  relaxation: "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300",
  nightlife: "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300",
  attractions: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300",
};

const BOOKMARK_NOTICE_MS = 2000;

export default function PlaceCard({
  place,
  onClick,
  onToggleSave,
  isSelected = false,
}: PlaceCardProps) {
  const { user } = useAuth();
  const { isPlaceSaved, toggleSavedPlace, isLoading: savedLoading } = useSavedPlaces();

  const [notice, setNotice] = useState<{ kind: "guest" | "error"; text: string } | null>(null);
  const togglingRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSaved = isPlaceSaved(place.id);
  const bookmarkUnavailable = savedLoading;

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const showNotice = (kind: "guest" | "error", text: string) => {
    setNotice({ kind, text });
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = setTimeout(() => setNotice(null), BOOKMARK_NOTICE_MS);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (togglingRef.current || savedLoading) return;

    togglingRef.current = true;
    try {
      const wasSaved = isSaved;
      const nowSaved = await toggleSavedPlace(buildSavePlaceInput(place));
      const outcome = resolveSavedToggleOutcome(wasSaved, nowSaved);

      if (outcome === "rolled-back") {
        if (!user) {
          showNotice("guest", "Sign in to save places");
        } else {
          showNotice("error", "Could not update saved places");
        }
      } else if (onToggleSave) {
        onToggleSave(place, nowSaved);
      }
    } finally {
      togglingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(place);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${place.name}, ${place.category}, rated ${place.rating.toFixed(1)}`}
      onClick={() => onClick(place)}
      onKeyDown={handleKeyDown}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-950/5 dark:bg-zinc-900 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        isSelected
          ? "border-blue-500 ring-2 ring-blue-500/30 dark:border-blue-400"
          : "border-zinc-200/90 hover:border-zinc-300 dark:border-zinc-800"
      }`}
    >
      <div className="flex flex-1 flex-col">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.imageUrl}
            alt={place.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />

          <div className="absolute top-3 left-3">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm ${
                CATEGORY_COLORS[place.category] || "bg-zinc-100 text-zinc-800"
              }`}
            >
              {place.category}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={bookmarkUnavailable}
            aria-label={isSaved ? "Remove from saved places" : "Save place"}
            aria-busy={bookmarkUnavailable}
            title={bookmarkUnavailable ? "Loading saved places\u2026" : undefined}
            className={`absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-md backdrop-blur-md transition-all hover:scale-110 hover:bg-white dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-900 ${
              bookmarkUnavailable
                ? "cursor-default hover:scale-100 hover:bg-white/80 dark:hover:bg-zinc-900/80"
                : ""
            }`}
          >
            <svg
              className={`h-4 w-4 transition-colors ${
                bookmarkUnavailable
                  ? "fill-zinc-300 text-zinc-400 dark:fill-zinc-700 dark:text-zinc-600"
                  : isSaved
                  ? "fill-rose-500 text-rose-500"
                  : "fill-none text-current"
              }`}
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
              />
            </svg>
          </button>

          {notice && (
            <div
              role={notice.kind === "guest" ? "status" : "alert"}
              className={`absolute left-1/2 top-12 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm whitespace-nowrap animate-fadeIn ${
                notice.kind === "guest" ? "bg-zinc-900/85" : "bg-rose-600/95"
              }`}
            >
              {notice.text}
            </div>
          )}

          <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {place.priceLevel === "free"
              ? "Free"
              : place.priceLevel === "budget"
              ? "$"
              : place.priceLevel === "moderate"
              ? "$$"
              : "$$$"}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-zinc-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400 line-clamp-1">
              {place.name}
            </h3>
            <div className="flex items-center gap-1 shrink-0 rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <svg className="h-3.5 w-3.5 fill-amber-400" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span>{place.rating.toFixed(1)}</span>
            </div>
          </div>

          <p className="mt-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
            {place.shortDescription || place.description}
          </p>

          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
            {place.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100 p-4 pt-3 dark:border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500">
        <span className="truncate max-w-[180px]">{place.address}</span>
        <span className="font-semibold text-blue-600 dark:text-blue-400 group-hover:underline flex items-center gap-0.5">
          Details &rarr;
        </span>
      </div>
    </div>
  );
}