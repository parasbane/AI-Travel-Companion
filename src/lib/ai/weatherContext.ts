import { formatDestinationSlug } from "@/lib/utils/slug";
import type { DestinationWeatherResponse } from "@/lib/weather/types";

/**
 * Upper bound on the number of forecast days normalized into AI context.
 * Keeps the grounded prompt bounded regardless of provider output.
 */
export const MAX_AI_FORECAST_DAYS = 5;

export interface AiWeatherCurrent {
  condition: string;
  conditionCode: number;
  temperatureC: number;
  apparentTemperatureC: number;
  observedAt: string;
}

export interface AiWeatherForecastDay {
  date: string;
  dayLabel: string;
  condition: string;
  conditionCode: number;
  highC: number;
  lowC: number;
  precipitationProbabilityPercent: number | null;
}

export interface AiWeatherContext {
  destinationSlug: string;
  destinationName: string;
  retrievedAt: string;
  current: AiWeatherCurrent | null;
  forecast: AiWeatherForecastDay[];
  /** Bounded, metric, deterministic one-line summary for the LLM. */
  summary: string;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Deterministic weekday label for a "YYYY-MM-DD" date using UTC so results are
 * identical regardless of where the server runs.
 */
function weekdayLabel(dateIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso ?? "");
  if (!match) return dateIso;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return WEEKDAY_NAMES[date.getUTCDay()];
}

/**
 * Build a shifted, primitives-only copy of the canonical weather envelope that
 * is safe to hand to an LLM. Returns null (never a fabricated envelope) when
 * weather is unavailable. Copies fields only — it adds no conditions,
 * temperatures, or probabilities that are not present in the source.
 */
export function buildAiWeatherContext(
  response: DestinationWeatherResponse
): AiWeatherContext | null {
  if (response.status !== "available") return null;

  const destinationSlug =
    formatDestinationSlug(response.destination.slug) ||
    response.destination.slug.trim().toLowerCase();

  const current: AiWeatherCurrent = {
    condition: response.data.condition,
    conditionCode: response.data.weatherCode,
    temperatureC: response.data.temperatureC,
    apparentTemperatureC: response.data.apparentTemperatureC,
    observedAt: response.data.observationTime,
  };

  const forecast: AiWeatherForecastDay[] = response.forecast
    .slice(0, MAX_AI_FORECAST_DAYS)
    .map((day) => ({
      date: day.date,
      dayLabel: weekdayLabel(day.date),
      condition: day.condition,
      conditionCode: day.weatherCode,
      highC: day.temperatureMaxC,
      lowC: day.temperatureMinC,
      precipitationProbabilityPercent: day.precipitationProbabilityPercent,
    }));

  const weather: AiWeatherContext = {
    destinationSlug,
    destinationName: response.destination.name,
    retrievedAt: response.data.fetchedAt,
    current,
    forecast,
    summary: "",
  };
  weather.summary = buildWeatherSummaryLine(weather);
  return weather;
}

/**
 * Compact metric summary of the grounded weather. Metric values here are
 * canonical: the °C/°F preference is a UI display-layer concern (F17) and is
 * never applied to AI grounding.
 */
export function buildWeatherSummaryLine(weather: {
  destinationName: string;
  current: AiWeatherCurrent | null;
  forecast: AiWeatherForecastDay[];
}): string {
  const clauses: string[] = [];

  if (weather.current) {
    let currentClause = `Currently ${weather.current.condition} at ${weather.current.temperatureC}°C`;
    if (weather.current.apparentTemperatureC !== weather.current.temperatureC) {
      currentClause += ` (feels like ${weather.current.apparentTemperatureC}°C)`;
    }
    clauses.push(currentClause);
  }

  const forecastClause = weather.forecast
    .slice(0, MAX_AI_FORECAST_DAYS)
    .map((day) => {
      let clause = `${day.dayLabel}: ${day.condition}, ${day.highC}°C / ${day.lowC}°C`;
      if (day.precipitationProbabilityPercent != null) {
        clause += `, ${day.precipitationProbabilityPercent}% rain`;
      }
      return clause;
    })
    .join("; ");

  if (forecastClause) {
    clauses.push(`Forecast: ${forecastClause}`);
  }

  const body = clauses.join(". ");
  return body
    ? `In ${weather.destinationName}: ${body}.`
    : `In ${weather.destinationName}: no weather data.`;
}

/**
 * Look up a grounded forecast day that exactly matches a trip calendarDate
 * ("YYYY-MM-DD"). Returns null when there is no weather or no matching day.
 */
export function forecastDayForDate(
  weather: AiWeatherContext | null,
  calendarDate: string | null | undefined
): AiWeatherForecastDay | null {
  if (!weather || typeof calendarDate !== "string") return null;
  const dateOnly = calendarDate.slice(0, 10);
  return weather.forecast.find((day) => day.date === dateOnly) ?? null;
}

/**
 * Factual, metric-only forecast annotation for a trip day's reasoning. Empty
 * string when no grounded match exists so the deterministic planner never
 * introduces invented weather. Purely informational — it does not re-rank or
 * reclassify anything (Feature 18 remains the only weather classifier).
 */
export function buildDayWeatherNote(
  weather: AiWeatherContext | null,
  calendarDate: string | null | undefined
): string {
  const day = forecastDayForDate(weather, calendarDate);
  if (!day) return "";
  let note = `Forecast for this day: ${day.condition}, ${day.highC}°C / ${day.lowC}°C`;
  if (day.precipitationProbabilityPercent != null) {
    note += `, ${day.precipitationProbabilityPercent}% rain`;
  }
  return `${note}.`;
}

/**
 * Heuristic flag for whether the traveller's question is likely weather/timing
 * related. Only used to label grounding for the model; weather context is
 * supplied whenever available, but the model is instructed to use it only when
 * it is actually relevant.
 */
export function isWeatherRelevantQuestion(message: string): boolean {
  const pattern =
    /(weather|forecast|rain|rainy|raining|downpour|drizzle|shower|sunny|sunshine|cloudy|clouds|storm|stormy|thunder|thunderstorm|hot|heat|warm|humid|humidity|wind|windy|breeze|chilly|cold|temperature|precipitation|umbrella|jacket|tonight|overnight|tomorrow)/i;
  return pattern.test(message ?? "");
}