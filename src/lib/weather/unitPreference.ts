"use client";

import { useSyncExternalStore } from "react";
import {
  WEATHER_UNITS_STORAGE_KEY,
  parseUnitSystem,
  type WeatherUnitSystem,
} from "./units";

export interface WeatherUnitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): WeatherUnitStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let cached: WeatherUnitSystem | null = null;
const listeners = new Set<() => void>();

export function readWeatherUnitSystem(
  storage: WeatherUnitStorage | null = defaultStorage()
): WeatherUnitSystem {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(WEATHER_UNITS_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  return parseUnitSystem(raw);
}

export function persistWeatherUnitSystem(
  units: WeatherUnitSystem,
  storage: WeatherUnitStorage | null = defaultStorage()
): void {
  try {
    storage?.setItem(WEATHER_UNITS_STORAGE_KEY, units);
  } catch {
    // Storage unavailable (e.g. private mode) — the in-memory choice still applies.
  }
}

export function setWeatherUnitSystem(units: WeatherUnitSystem): void {
  if (units !== cached) {
    cached = units;
    persistWeatherUnitSystem(units);
  }
  for (const listener of listeners) {
    listener();
  }
}

function getSnapshot(): WeatherUnitSystem {
  if (cached === null) {
    cached = readWeatherUnitSystem();
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window === "undefined") {
    return () => listeners.delete(listener);
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === WEATHER_UNITS_STORAGE_KEY) {
      cached = parseUnitSystem(event.newValue);
      for (const current of listeners) {
        current();
      }
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useWeatherUnits(): [
  WeatherUnitSystem,
  (next: WeatherUnitSystem) => void,
] {
  const units = useSyncExternalStore(
    subscribe,
    getSnapshot,
    (): WeatherUnitSystem => "metric"
  );
  return [units, setWeatherUnitSystem];
}