"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type {
  CurrentWeather,
  DailyForecast,
  DestinationWeatherResponse,
} from "./types";

export type DestinationWeatherState =
  | { kind: "loading" }
  | { kind: "available"; data: CurrentWeather; forecast: DailyForecast[] }
  | { kind: "unavailable"; message: string };

export const WEATHER_UNAVAILABLE_MESSAGE =
  "Live weather is unavailable for this destination right now.";

/**
 * Module-level, per-destination cache of the fetched weather state (plus any
 * in-flight request guard). Multiple consumer components on the same page
 * share one request and one subscription instead of duplicating fetches.
 */
const states = new Map<string, DestinationWeatherState>();
const inflight = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

function notify(slug: string): void {
  const callbacks = listeners.get(slug);
  if (!callbacks) {
    return;
  }
  for (const callback of callbacks) {
    callback();
  }
}

function getSnapshotFor(slug: string): DestinationWeatherState | null {
  return states.get(slug) ?? null;
}

export function loadDestinationWeather(slug: string): void {
  if (states.has(slug) || inflight.has(slug)) {
    return;
  }
  inflight.add(slug);
  states.set(slug, { kind: "loading" });
  notify(slug);

  void (async () => {
    try {
      const response = await fetch(
        `/api/destinations/${encodeURIComponent(slug)}/weather`,
        {
          headers: { accept: "application/json" },
        }
      );
      const payload = (await response.json()) as DestinationWeatherResponse;
      if (payload.status === "available" && payload.data) {
        states.set(slug, {
          kind: "available",
          data: payload.data,
          forecast: Array.isArray(payload.forecast) ? payload.forecast : [],
        });
      } else {
        states.set(slug, {
          kind: "unavailable",
          message: WEATHER_UNAVAILABLE_MESSAGE,
        });
      }
    } catch {
      states.set(slug, {
        kind: "unavailable",
        message: WEATHER_UNAVAILABLE_MESSAGE,
      });
    } finally {
      inflight.delete(slug);
      notify(slug);
    }
  })();
}

/**
 * Hydration-safe hook that shares one weather request per destination across
 * every consuming component (e.g. the weather card and the matched-picks
 * panel). Returns `loading` until the shared state resolves.
 */
export function useDestinationWeather(
  destinationSlug: string
): DestinationWeatherState {
  const slug = destinationSlug;

  const subscribe = useCallback(
    (callback: () => void): (() => void) => {
      let callbacks = listeners.get(slug);
      if (!callbacks) {
        callbacks = new Set();
        listeners.set(slug, callbacks);
      }
      callbacks.add(callback);
      return () => {
        const current = listeners.get(slug);
        if (!current) {
          return;
        }
        current.delete(callback);
        if (current.size === 0) {
          listeners.delete(slug);
        }
      };
    },
    [slug]
  );

  const getSnapshot = useCallback(() => getSnapshotFor(slug), [slug]);
  const getServerSnapshot = useCallback(() => null, []);

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    loadDestinationWeather(slug);
  }, [slug]);

  return state ?? { kind: "loading" };
}