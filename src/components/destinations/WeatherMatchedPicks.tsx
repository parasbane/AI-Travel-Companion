"use client";

import React from "react";
import type { Place } from "@/lib/places/types";
import { useDestinationWeather } from "@/lib/weather/useDestinationWeather";
import { useWeatherUnits } from "@/lib/weather/unitPreference";
import {
  buildWeatherMatches,
  type WeatherMatchLean,
} from "@/lib/weather/weatherMatches";

interface WeatherMatchedPicksProps {
  destinationSlug: string;
  places: Place[];
}

const LEAN_ACCENT: Record<WeatherMatchLean, string> = {
  indoor: "text-sky-600 dark:text-sky-400",
  outdoor: "text-amber-600 dark:text-amber-400",
  balanced: "text-zinc-500 dark:text-zinc-400",
};

export default function WeatherMatchedPicks({
  destinationSlug,
  places,
}: WeatherMatchedPicksProps) {
  const state = useDestinationWeather(destinationSlug);
  const [units] = useWeatherUnits();

  // Unknown destination / unavailable weather: hide the panel, no fabrication.
  if (state.kind !== "available") {
    return null;
  }

  const slots = buildWeatherMatches({
    places,
    current: state.data,
    forecast: state.forecast,
    units,
  });
  if (slots.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Weather-matched picks"
      className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8"
    >
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400"
            aria-hidden="true"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3z"
              />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-bold text-zinc-900 sm:text-lg dark:text-white">
              Weather-matched picks
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Places that fit the forecast, refreshed live
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {slots.map((slot) => (
            <div
              key={slot.date}
              className="rounded-2xl bg-zinc-50 px-4 py-4 dark:bg-zinc-800/60"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {slot.label}
                </p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {slot.temperature}
                </p>
              </div>
              <p className={`mt-1 text-xs font-medium ${LEAN_ACCENT[slot.lean]}`}>
                {slot.condition}
              </p>
              {slot.picks.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  No spots in the catalog for this day yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {slot.picks.map((pick) => (
                    <li key={pick.place.id}>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {pick.place.name}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {pick.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}