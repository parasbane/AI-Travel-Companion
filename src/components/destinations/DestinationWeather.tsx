"use client";

import React from "react";
import { useWeatherUnits } from "@/lib/weather/unitPreference";
import {
  displayCurrentConditions,
  displayForecast,
  type WeatherUnitSystem,
} from "@/lib/weather/units";
import {
  useDestinationWeather,
  type DestinationWeatherState,
} from "@/lib/weather/useDestinationWeather";

interface DestinationWeatherProps {
  destinationSlug: string;
  destinationName: string;
}

function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function weekdayLabel(date: string, index: number): string {
  if (index === 0) {
    return "Today";
  }
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
    });
  } catch {
    return date;
  }
}

export default function DestinationWeather({
  destinationSlug,
  destinationName,
}: DestinationWeatherProps) {
  const state: DestinationWeatherState = useDestinationWeather(destinationSlug);
  const [units, setUnits] = useWeatherUnits();

  const statusPill =
    state.kind === "loading"
      ? "Loading…"
      : state.kind === "available"
        ? `Updated ${formatClock(state.data.fetchedAt)}`
        : "Unavailable";

  const availableDisplay =
    state.kind === "available"
      ? {
          current: displayCurrentConditions(state.data, units),
          forecast: displayForecast(state.forecast, units),
        }
      : null;

  return (
    <section
      aria-label="Live weather"
      className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8"
    >
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
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
                  d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm-4-6V4m0 16v-2m6.364-10.364l1.414-1.414M4.222 19.778l1.414-1.414m0-12.728L4.222 4.222M19.778 19.778l-1.414-1.414M3 12h2m14 0h2"
                />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-bold text-zinc-900 sm:text-lg dark:text-white">
                Live weather
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Current conditions in {destinationName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              role="group"
              aria-label="Temperature units"
              className="flex shrink-0 rounded-full border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {(["metric", "imperial"] as const).map((unit: WeatherUnitSystem) => {
                const selected = units === unit;
                return (
                  <button
                    key={unit}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Show temperatures in ${unit === "imperial" ? "Fahrenheit" : "Celsius"}`}
                    onClick={() => setUnits(unit)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                      selected
                        ? "bg-white text-blue-600 shadow-sm dark:bg-zinc-900 dark:text-blue-400"
                        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    }`}
                  >
                    {unit === "imperial" ? "°F" : "°C"}
                  </button>
                );
              })}
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                state.kind === "available"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : state.kind === "unavailable"
                    ? "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                    : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {statusPill}
            </span>
          </div>
        </div>

        <div className="mt-4 min-h-[112px]" aria-live="polite">
          {state.kind === "loading" && (
            <>
              <div className="flex h-[112px] flex-col justify-center gap-3">
                <div className="h-6 w-44 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-64 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-56 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
              </div>
              <div className="mt-5 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
                <div className="h-3 w-16 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[0, 1, 2, 3, 4].map((cell) => (
                    <div
                      key={cell}
                      className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/60"
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {state.kind === "unavailable" && (
            <div className="flex h-[112px] items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <svg
                className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {state.message}
            </div>
          )}

          {state.kind === "available" && availableDisplay && (
            <>
              <div className="flex min-h-[112px] flex-wrap items-center justify-between gap-x-8 gap-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-500 dark:bg-sky-950/60 dark:text-sky-400">
                    <svg
                      className="h-7 w-7"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm-4-6V4m0 16v-2m6.364-10.364l1.414-1.414M4.222 19.778l1.414-1.414m0-12.728L4.222 4.222M19.778 19.778l-1.414-1.414M3 12h2m14 0h2"
                      />
                    </svg>
                  </span>
                  <div>
                    <p className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                      {availableDisplay.current.temperature}
                    </p>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      {state.data.condition}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <p>{availableDisplay.current.feelsLike}</p>
                  <p>{availableDisplay.current.wind}</p>
                  <p>{availableDisplay.current.precipitation}</p>
                </div>

                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {state.data.timezone}
                </span>
              </div>

              {state.forecast.length > 0 && (
                <div className="mt-5 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Forecast
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {availableDisplay.forecast.map((day, index) => (
                      <div
                        key={day.date}
                        className="rounded-2xl bg-zinc-50 px-3 py-3 text-center dark:bg-zinc-800/60"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {weekdayLabel(day.date, index)}
                        </p>
                        <p className="mt-1.5 text-lg font-bold text-zinc-900 dark:text-white">
                          {day.high}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {day.low}
                        </p>
                        <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                          {day.condition}
                        </p>
                        {day.rainProbabilityPercent !== null && (
                          <p className="mt-0.5 text-[11px] text-sky-600 dark:text-sky-400">
                            {Math.round(day.rainProbabilityPercent)}%
                            rain
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}