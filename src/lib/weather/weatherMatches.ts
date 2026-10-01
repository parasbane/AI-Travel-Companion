import type { Place } from "@/lib/places/types";
import { weatherCodeToCondition } from "./weatherCodes";
import type { CurrentWeather, DailyForecast } from "./types";
import { roundTemperature, type WeatherUnitSystem } from "./units";

export const MAX_WEATHER_MATCH_SLOTS = 3;
export const MAX_PICKS_PER_DAY = 3;
export const HEAT_THRESHOLD_C = 33;

const HIGH_RAIN_PROBABILITY = 60;
const LOW_RAIN_PROBABILITY = 25;

export type WeatherMatchLean = "indoor" | "outdoor" | "balanced";
export type WeatherMatchCause = "rain" | "heat" | "advisory";

export interface WeatherDayCondition {
  code: number;
  label: string;
  lean: WeatherMatchLean;
  cause: WeatherMatchCause;
}

/** WMO codes where being indoors is the sensible default. */
const INDOOR_CODES: ReadonlySet<number> = new Set([
  51, 53, 55, 56, 57,
  61, 63, 65, 66, 67,
  71, 73, 75, 77,
  80, 81, 82, 85, 86,
  95, 96, 99,
]);

const OUTDOOR_CODES: ReadonlySet<number> = new Set([0, 1, 2, 3]);
const FOG_CODES: ReadonlySet<number> = new Set([45, 48]);

const INDOOR_CATEGORIES: ReadonlySet<Place["category"]> = new Set([
  "culture",
  "food",
  "attractions",
  "relaxation",
]);

const OUTDOOR_CATEGORIES: ReadonlySet<Place["category"]> = new Set([
  "nature",
  "adventure",
]);

const INDOOR_TAG_WORDS: readonly string[] = [
  "museum", "gallery", "cafe", "café", "dining", "restaurant", "bakery",
  "shopping", "market", "indoor", "art", "brewery", "wine", "tea", "spa",
  "temple", "church", "palace", "fort", "heritage", "history", "baroque",
  "unesco", "landmark", "cathedral", "castle", "exhibit", "collection",
  "cuisine", "cocktail", "pub", "club",
];

const OUTDOOR_TAG_WORDS: readonly string[] = [
  "beach", "waterfall", "trek", "hike", "trail", "swim", "sunset", "sunrise",
  "scenic", "view", "cliff", "garden", "park", "forest", "jungle", "mountain",
  "safari", "boat", "kayak", "surf", "cycling", "outdoor", "open air",
  "glacier", "peak", "promenade", "plaza", "resort", "pool", "camping",
  "dolphin", "snorkel", "watersports",
];

const INDOOR_DESC_WORDS: readonly string[] = [
  "museum", "gallery", "indoor", "interior", "collection", "exhibit",
  "basilica", "church", "temple", "dining", "cuisine",
];

const OUTDOOR_DESC_WORDS: readonly string[] = [
  "beach", "bay", "waterfall", "trail", "jungle", "forest", "garden",
  "sunset", "scenic", "view", "swimming", "coastal", "ocean", "sea", "trek",
  "hike", "outdoor", "park", "waterfront",
];

/**
 * Classify a single forecast day into an indoor/outdoor/balanced lean.
 * Deterministic: the same inputs always produce the same classification.
 */
export function classifyForecastDay(opts: {
  weatherCode: number;
  precipitationProbabilityPercent: number | null;
  temperatureMaxC: number | null;
}): WeatherDayCondition {
  const { weatherCode, precipitationProbabilityPercent, temperatureMaxC } = opts;
  const probability = precipitationProbabilityPercent;

  let lean: WeatherMatchLean;
  let cause: WeatherMatchCause;

  if (INDOOR_CODES.has(weatherCode)) {
    lean = "indoor";
    cause = "rain";
  } else if (OUTDOOR_CODES.has(weatherCode)) {
    if (probability !== null && probability >= HIGH_RAIN_PROBABILITY) {
      lean = "indoor";
      cause = "rain";
    } else {
      lean = "outdoor";
      cause = "advisory";
    }
  } else if (FOG_CODES.has(weatherCode)) {
    lean =
      probability !== null && probability >= HIGH_RAIN_PROBABILITY
        ? "indoor"
        : "balanced";
    cause = "advisory";
  } else {
    // Unknown/unrecognized code — fall back on the probability signal.
    lean =
      probability !== null && probability >= HIGH_RAIN_PROBABILITY
        ? "indoor"
        : probability !== null && probability <= LOW_RAIN_PROBABILITY
          ? "outdoor"
          : "balanced";
    cause = "advisory";
  }

  if (temperatureMaxC !== null && temperatureMaxC >= HEAT_THRESHOLD_C) {
    if (cause !== "rain") {
      lean = "indoor";
      cause = "heat";
    }
  }

  return {
    code: weatherCode,
    label: weatherCodeToCondition(weatherCode),
    lean,
    cause,
  };
}

function placeAffinity(place: Place, lean: WeatherMatchLean): number {
  if (lean === "balanced") {
    return 0;
  }
  const indoor = lean === "indoor";
  let score = 0;

  if (INDOOR_CATEGORIES.has(place.category)) {
    score += indoor ? 30 : -18;
  }
  if (OUTDOOR_CATEGORIES.has(place.category)) {
    score += indoor ? -18 : 30;
  }

  const tags = place.tags.map((tag) => tag.toLowerCase());
  for (const word of INDOOR_TAG_WORDS) {
    if (tags.some((tag) => tag.includes(word))) {
      score += indoor ? 12 : -12;
    }
  }
  for (const word of OUTDOOR_TAG_WORDS) {
    if (tags.some((tag) => tag.includes(word))) {
      score += indoor ? -12 : 12;
    }
  }

  const description = place.description.toLowerCase();
  for (const word of INDOOR_DESC_WORDS) {
    if (description.includes(word)) {
      score += indoor ? 5 : -5;
    }
  }
  for (const word of OUTDOOR_DESC_WORDS) {
    if (description.includes(word)) {
      score += indoor ? -5 : 5;
    }
  }

  return score;
}

function rankPlacesForWeather(
  places: readonly Place[],
  lean: WeatherMatchLean
): Place[] {
  return places
    .map((place, index) => ({ place, index, score: placeAffinity(place, lean) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.place);
}

function buildReason(
  condition: WeatherDayCondition,
  temperatureMaxC: number | null,
  units: WeatherUnitSystem
): string {
  if (condition.cause === "rain") {
    return `Indoor highlight — a dry escape from ${condition.label.toLowerCase()}.`;
  }
  if (condition.cause === "heat") {
    return `Shady pick for the ${roundTemperature(temperatureMaxC ?? 0, units)}° heat.`;
  }
  if (condition.lean === "outdoor") {
    return `Outdoor highlight — made for ${condition.label.toLowerCase()}.`;
  }
  return "Works well in any weather — a flexible pick.";
}

function formatMatchTemperature(
  maxC: number,
  minC: number,
  units: WeatherUnitSystem
): string {
  return `${roundTemperature(maxC, units)}° / ${roundTemperature(minC, units)}°`;
}

function slotLabel(date: string, index: number): string {
  if (index === 0) {
    return "Today";
  }
  if (index === 1) {
    return "Tomorrow";
  }
  try {
    return (
      new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
      }) || date
    );
  } catch {
    return date;
  }
}

export interface WeatherMatchPick {
  place: Place;
  reason: string;
}

export interface WeatherMatchSlot {
  date: string;
  label: string;
  condition: string;
  temperature: string;
  lean: WeatherMatchLean;
  cause: WeatherMatchCause;
  picks: WeatherMatchPick[];
}

export interface BuildWeatherMatchesInput {
  places: readonly Place[];
  current: CurrentWeather;
  forecast: readonly DailyForecast[];
  units: WeatherUnitSystem;
}

function buildSlot(
  entry: {
    date: string;
    index: number;
    conditionCode: number;
    conditionLabel: string;
    maxC: number;
    minC: number;
  },
  condition: WeatherDayCondition,
  places: readonly Place[],
  units: WeatherUnitSystem
): WeatherMatchSlot {
  const picks = rankPlacesForWeather(places, condition.lean)
    .slice(0, MAX_PICKS_PER_DAY)
    .map((place) => ({
      place,
      reason: buildReason(condition, entry.maxC, units),
    }));

  return {
    date: entry.date,
    label: slotLabel(entry.date, entry.index),
    condition: entry.conditionLabel,
    temperature: formatMatchTemperature(entry.maxC, entry.minC, units),
    lean: condition.lean,
    cause: condition.cause,
    picks,
  };
}

/**
 * Build weather-matched recommendation slots from the live forecast.
 * Pure and deterministic: the input arrays are never mutated and the output
 * ordering is fully stable for identical inputs.
 */
export function buildWeatherMatches(
  input: BuildWeatherMatchesInput
): WeatherMatchSlot[] {
  const { places, current, forecast, units } = input;
  const slots: WeatherMatchSlot[] = [];

  if (forecast.length === 0) {
    const condition = classifyForecastDay({
      weatherCode: current.weatherCode,
      precipitationProbabilityPercent: null,
      temperatureMaxC: current.temperatureC,
    });
    slots.push(
      buildSlot(
        {
          date: current.observationTime.slice(0, 10),
          index: 0,
          conditionCode: current.weatherCode,
          conditionLabel: current.condition,
          maxC: current.temperatureC,
          minC: current.temperatureC,
        },
        condition,
        places,
        units
      )
    );
    return slots;
  }

  forecast.slice(0, MAX_WEATHER_MATCH_SLOTS).forEach((day, index) => {
    const condition = classifyForecastDay({
      weatherCode: day.weatherCode,
      precipitationProbabilityPercent: day.precipitationProbabilityPercent,
      temperatureMaxC: day.temperatureMaxC,
    });
    slots.push(
      buildSlot(
        {
          date: day.date,
          index,
          conditionCode: day.weatherCode,
          conditionLabel: index === 0 ? current.condition : day.condition,
          maxC: day.temperatureMaxC,
          minC: day.temperatureMinC,
        },
        condition,
        places,
        units
      )
    );
  });

  return slots;
}