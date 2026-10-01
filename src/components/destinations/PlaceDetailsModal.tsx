"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/places/types";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useSavedPlaces } from "@/context/SavedPlacesContext";
import { buildSavePlaceInput } from "@/lib/saved/placeToSaveInput";
import { resolveSavedToggleOutcome } from "@/lib/saved/toggleOutcome";

interface PlaceDetailsModalProps {
  place: Place | null;
  onClose: () => void;
  onToggleSave?: (place: Place, saved: boolean) => void;
}

const SAVE_NOTICE_MS = 2000;

export default function PlaceDetailsModal({
  place,
  onClose,
  onToggleSave,
}: PlaceDetailsModalProps) {
  const { user } = useAuth();
  const { isPlaceSaved, toggleSavedPlace, isLoading: savedLoading } = useSavedPlaces();

  const [saveToast, setSaveToast] = useState(false);
  const [notice, setNotice] = useState<{ kind: "guest" | "error"; text: string } | null>(null);
  const togglingRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, [onClose]);

  if (!place) return null;

  const isSaved = isPlaceSaved(place.id);

  const showNotice = (kind: "guest" | "error", text: string) => {
    setNotice({ kind, text });
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = setTimeout(() => setNotice(null), SAVE_NOTICE_MS);
  };

  const handleToggleBookmark = async () => {
    if (togglingRef.current || savedLoading) return;

    togglingRef.current = true;
    try {
      const wasSaved = isSaved;
      const nowSaved = await toggleSavedPlace(buildSavePlaceInput(place));
      const outcome = resolveSavedToggleOutcome(wasSaved, nowSaved);

      if (outcome === "rolled-back") {
        setSaveToast(false);
        if (!user) {
          showNotice("guest", "Sign in to save places");
        } else {
          showNotice("error", "Could not update saved places");
        }
      } else {
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), SAVE_NOTICE_MS);
        if (onToggleSave) {
          onToggleSave(place, nowSaved);
        }
      }
    } finally {
      togglingRef.current = false;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-sm animate-fadeIn"
    >
      {/* Click outside backdrop */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative z-10 flex flex-col max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-left">
        {notice && (
          <div
            role={notice.kind === "guest" ? "status" : "alert"}
            className={`absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm whitespace-nowrap animate-fadeIn ${
              notice.kind === "guest" ? "bg-zinc-900/85" : "bg-rose-600/95"
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-transform hover:scale-105 hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Close details"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Header Image */}
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.imageUrl}
            alt={place.name}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

          {/* Category & Badges on Image */}
          <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
            <div>
              <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
                {place.category}
              </span>
              <h2
                id="place-modal-title"
                className="mt-2 text-2xl sm:text-3xl font-extrabold text-white"
              >
                {place.name}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-300 font-medium">
                {place.destination} • {place.address}
              </p>
            </div>

            {/* Rating pill */}
            <div className="flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-1.5 text-sm font-bold text-zinc-900 shadow-md backdrop-blur-md">
              <svg className="h-4 w-4 fill-amber-400" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span>{place.rating.toFixed(1)}</span>
              <span className="text-xs font-normal text-zinc-500">
                ({place.reviewCount.toLocaleString()})
              </span>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          {saveToast && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300 animate-fadeIn"
            >
              {isSaved ? "Saved to your Travel Profile!" : "Removed from saved places."}
            </div>
          )}

          {/* Description */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              About This Experience
            </h3>
            <p className="mt-2 text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {place.description}
            </p>
          </div>

          {/* Practical Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800">
            {/* Opening Hours */}
            {place.openingHours && (
              <div className="flex items-start gap-3">
                <span className="text-zinc-400 dark:text-zinc-500 mt-0.5">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Hours</h4>
                  <p className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {place.openingHours}
                  </p>
                </div>
              </div>
            )}

            {/* Price Level */}
            <div className="flex items-start gap-3">
              <span className="text-zinc-400 dark:text-zinc-500 mt-0.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Estimated Cost</h4>
                <p className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-200 capitalize">
                  {place.priceLevel}
                </p>
              </div>
            </div>

            {/* Map Coordinates (Task 5 Foundation) */}
            <div className="flex items-start gap-3">
              <span className="text-zinc-400 dark:text-zinc-500 mt-0.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Coordinates</h4>
                <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">
                  {place.coordinates.latitude.toFixed(4)}, {place.coordinates.longitude.toFixed(4)}
                </p>
              </div>
            </div>

            {/* Tags */}
            <div className="flex items-start gap-3">
              <span className="text-zinc-400 dark:text-zinc-500 mt-0.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </span>
              <div>
                <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Highlights</h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {place.tags.map((tag) => (
                    <span key={tag} className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Bar */}
        <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 p-4 sm:px-8 dark:border-zinc-800 dark:bg-zinc-950">
          <Button
            variant={isSaved ? "secondary" : "outline"}
            size="md"
            onClick={handleToggleBookmark}
            disabled={savedLoading}
            leftIcon={
              <svg
                className={`h-4 w-4 ${
                  savedLoading
                    ? "fill-zinc-300 text-zinc-400 dark:fill-zinc-700 dark:text-zinc-600"
                    : isSaved
                    ? "fill-rose-500 text-rose-500"
                    : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
              </svg>
            }
          >
            {isSaved ? "Saved to Profile" : "Save Place"}
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={onClose}
          >
            Done Exploring
          </Button>
        </div>
      </div>
    </div>
  );
}