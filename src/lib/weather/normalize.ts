import { weatherCodeToCondition } from "./weatherCodes";
import type { CurrentWeather, DailyForecast } from "./types";

export type WeatherDataErrorKind = "malformed" | "upstream";

export class WeatherDataError extends Error {
  readonly kind: WeatherDataErrorKind;

  constructor(kind: WeatherDataErrorKind, message: string) {
    super(message);
    this.name = "WeatherDataError";
    this.kind = kind;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function requireFinite(value: unknown, message: string): number {
  const number = readFiniteNumber(value);
  if (number === null) {
    throw new WeatherDataError("malformed", message);
  }
  return number;
}

/**
 * Normalize an Open-Meteo `/v1/forecast` payload into the typed weather model.
 * Throws `WeatherDataError` for malformed payloads or upstream error bodies so
 * callers can map the failure onto a stable envelope.
 */
export function normalizeCurrentWeather(
  raw: unknown,
  fetchedAt = new Date()
): CurrentWeather {
  if (!isRecord(raw)) {
    throw new WeatherDataError(
      "malformed",
      "Weather response must be an object."
    );
  }

  if (raw.error === true) {
    throw new WeatherDataError(
      "upstream",
      typeof raw.reason === "string" && raw.reason
        ? raw.reason
        : "Weather provider returned an error."
    );
  }

  const current = raw.current;
  if (!isRecord(current)) {
    throw new WeatherDataError(
      "malformed",
      "Weather response is missing the current block."
    );
  }

  if (typeof raw.timezone !== "string" || !raw.timezone) {
    throw new WeatherDataError(
      "malformed",
      "Weather response is missing the timezone."
    );
  }

  if (typeof current.time !== "string" || !current.time) {
    throw new WeatherDataError(
      "malformed",
      "Weather response is missing the observation time."
    );
  }

  const temperature = requireFinite(
    current.temperature_2m,
    "Weather response is missing temperature."
  );
  const apparentTemperature = requireFinite(
    current.apparent_temperature,
    "Weather response is missing apparent temperature."
  );
  const weatherCode = requireFinite(
    current.weather_code,
    "Weather response is missing the weather code."
  );
  const windSpeed = requireFinite(
    current.wind_speed_10m,
    "Weather response is missing wind speed."
  );

  return {
    temperatureC: temperature,
    apparentTemperatureC: apparentTemperature,
    weatherCode: Math.trunc(weatherCode),
    condition: weatherCodeToCondition(Math.trunc(weatherCode)),
    windSpeedKmh: windSpeed,
    precipitationMm: readFiniteNumber(current.precipitation),
    rainMm: readFiniteNumber(current.rain),
    snowfallCm: readFiniteNumber(current.snowfall),
    observationTime: current.time,
    timezone: raw.timezone,
    fetchedAt: fetchedAt.toISOString(),
  };
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) {
    throw new WeatherDataError(
      "malformed",
      `Weather response has an invalid ${label} list.`
    );
  }
  return value as string[];
}

function requireNumberArray(value: unknown, label: string): number[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new WeatherDataError(
      "malformed",
      `Weather response has an invalid ${label} list.`
    );
  }
  return value as number[];
}

function readOptionalNumberArray(
  value: unknown,
  label: string
): Array<number | null> | null {
  if (value === undefined) {
    return null;
  }
  if (
    !Array.isArray(value) ||
    value.some(
      (item) => item !== null && (typeof item !== "number" || !Number.isFinite(item))
    )
  ) {
    throw new WeatherDataError(
      "malformed",
      `Weather response has an invalid ${label} list.`
    );
  }
  return value as Array<number | null>;
}

/**
 * Normalize the Open-Meteo `daily` block into a compact forecast list.
 * A payload without a `daily` block yields an empty forecast (no data is
 * fabricated). A present-but-malformed block throws `WeatherDataError`.
 */
export function normalizeDailyForecast(raw: unknown): DailyForecast[] {
  if (!isRecord(raw)) {
    throw new WeatherDataError(
      "malformed",
      "Weather response must be an object."
    );
  }

  if (raw.error === true) {
    throw new WeatherDataError(
      "upstream",
      typeof raw.reason === "string" && raw.reason
        ? raw.reason
        : "Weather provider returned an error."
    );
  }

  if (raw.daily === undefined) {
    return [];
  }

  const daily = raw.daily;
  if (!isRecord(daily)) {
    throw new WeatherDataError(
      "malformed",
      "Weather response has an invalid daily block."
    );
  }

  const dates = requireStringArray(daily.time, "daily time");
  const codes = requireNumberArray(daily.weather_code, "weather code");
  const maxes = requireNumberArray(
    daily.temperature_2m_max,
    "maximum temperature"
  );
  const mins = requireNumberArray(
    daily.temperature_2m_min,
    "minimum temperature"
  );
  const winds = readOptionalNumberArray(
    daily.wind_speed_10m_max,
    "wind speed"
  );
  const probabilities = readOptionalNumberArray(
    daily.precipitation_probability_max,
    "precipitation probability"
  );

  const series = [dates, codes, maxes, mins, winds, probabilities].filter(
    (seriesItem): seriesItem is number[] | string[] => seriesItem !== null
  );
  if (series.some((seriesItem) => seriesItem.length !== dates.length)) {
    throw new WeatherDataError(
      "malformed",
      "Weather response daily series have mismatched lengths."
    );
  }

  return dates.map((date, index) => {
    const code = Math.trunc(codes[index]);
    return {
      date,
      weatherCode: code,
      condition: weatherCodeToCondition(code),
      temperatureMaxC: maxes[index],
      temperatureMinC: mins[index],
      precipitationProbabilityPercent: probabilities
        ? probabilities[index]
        : null,
      windSpeedMaxKmh: winds ? winds[index] : null,
    };
  });
}