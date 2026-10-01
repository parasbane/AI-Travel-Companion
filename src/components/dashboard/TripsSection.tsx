"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useTrips } from "@/context/TripsContext";
import CreateTripModal from "./CreateTripModal";
import type { TripStatus } from "@/lib/saved/types";
import { slugToTitle } from "@/lib/utils/slug";
import {
  formatTripDateRange,
  tripDurationDays,
} from "@/lib/saved/tripDates";

const STATUS_STYLES: Record<TripStatus, string> = {
  planning: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  upcoming: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
};

const DELETE_ERROR_MS = 3000;

function TripCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 animate-pulse">
      <div className="h-24 w-full bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-800 dark:to-zinc-700" />
      <div className="p-5 space-y-3">
        <div className="h-5 w-2/3 rounded-md bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-3.5 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-3.5 w-3/5 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="border-t border-zinc-100 p-4 pt-3 dark:border-zinc-800">
        <div className="h-3.5 w-1/4 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

interface TripsSectionProps {
  className?: string;
}

export default function TripsSection({ className = "" }: TripsSectionProps) {
  const { trips, isLoading, deleteTrip } = useTrips();

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deletingRef = useRef<Set<string>>(new Set());
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
    errorTimerRef.current = setTimeout(() => setErrorMessage(null), DELETE_ERROR_MS);
  }, []);

  const handleDelete = useCallback(
    async (tripId: string) => {
      if (deletingRef.current.has(tripId)) return;
      deletingRef.current.add(tripId);
      try {
        const ok = await deleteTrip(tripId);
        if (!ok) {
          showError("Could not delete this trip. Please try again.");
        }
      } finally {
        deletingRef.current.delete(tripId);
      }
    },
    [deleteTrip, showError]
  );

  return (
    <section
      className={`rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
      aria-labelledby="my-trips-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 id="my-trips-heading" className="text-xl font-bold text-zinc-900 dark:text-white">
            My Trips
          </h2>
          {!isLoading && trips.length > 0 && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {trips.length}
            </span>
          )}
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={() => setCreateOpen(true)}
          leftIcon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Create Trip
        </Button>
      </div>

      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Organized trip plans and dates, ready for itinerary planning later.
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
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <TripCardSkeleton key={idx} />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-200 p-8 text-center sm:p-10 dark:border-zinc-800 animate-fadeIn">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
            No trips planned yet
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Create your first trip with a destination and dates, then pick places to add later.
          </p>
          <Button
            className="mt-6"
            variant="primary"
            size="md"
            onClick={() => setCreateOpen(true)}
            leftIcon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Plan your first trip
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => {
            const days = tripDurationDays(trip);
            return (
              <article
                key={trip.id}
                className="group flex flex-col overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                {/* Gradient band header */}
                <div className="flex h-24 items-center justify-between gap-3 bg-gradient-to-br from-indigo-500 via-blue-500 to-sky-500 px-5">
                  <h3 className="text-lg font-extrabold text-white drop-shadow-sm line-clamp-2">
                    {trip.title}
                  </h3>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm ${STATUS_STYLES[trip.status]}`}
                  >
                    {trip.status}
                  </span>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    <svg className="h-4 w-4 shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="line-clamp-1">{trip.destinationName || slugToTitle(trip.destinationSlug)}</span>
                  </p>

                  <p className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{formatTripDateRange(trip)}</span>
                  </p>

                  {days !== null && (
                    <span className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {days} day{days === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-zinc-100 p-4 pt-3 dark:border-zinc-800/80">
                  <Link
                    href={`/dashboard/trips/${trip.id}`}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    aria-label={`View trip ${trip.title}`}
                  >
                    View details
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleDelete(trip.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-rose-600 transition-colors hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-400 dark:hover:text-rose-300"
                    aria-label={`Delete trip ${trip.title}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CreateTripModal open={isCreateOpen} onClose={() => setCreateOpen(false)} />
    </section>
  );
}