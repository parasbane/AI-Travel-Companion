import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCurrentWeather,
  normalizeDailyForecast,
  WeatherDataError,
} from "./normalize";

const FIXED_FETCHED_AT = new Date("2026-09-22T08:00:00.000Z");

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    current: {
      time: "2026-09-22T14:00",
      temperature_2m: 28.4,
      apparent_temperature: 31.1,
      weather_code: 61,
      wind_speed_10m: 12.3,
      precipitation: 0.4,
      rain: 0.4,
      snowfall: 0,
    },
    timezone: "Asia/Kolkata",
    ...overrides,
  };
}

describe("normalizeCurrentWeather", () => {
  it("normalizes a valid response into the typed model", () => {
    const normalized = normalizeCurrentWeather(validPayload(), FIXED_FETCHED_AT);
    assert.equal(normalized.temperatureC, 28.4);
    assert.equal(normalized.apparentTemperatureC, 31.1);
    assert.equal(normalized.weatherCode, 61);
    assert.equal(normalized.condition, "Light rain");
    assert.equal(normalized.windSpeedKmh, 12.3);
    assert.equal(normalized.precipitationMm, 0.4);
    assert.equal(normalized.rainMm, 0.4);
    assert.equal(normalized.snowfallCm, 0);
    assert.equal(normalized.observationTime, "2026-09-22T14:00");
    assert.equal(normalized.timezone, "Asia/Kolkata");
    assert.equal(normalized.fetchedAt, "2026-09-22T08:00:00.000Z");
  });

  it("preserves null precipitation when the provider omits it", () => {
    const normalized = normalizeCurrentWeather(
      validPayload({
        current: {
          ...validPayload().current,
          precipitation: null,
          rain: null,
          snowfall: null,
        },
      }),
      FIXED_FETCHED_AT
    );
    assert.equal(normalized.precipitationMm, null);
    assert.equal(normalized.rainMm, null);
    assert.equal(normalized.snowfallCm, null);
  });

  it("keeps an unknown weather code but still normalizes", () => {
    const normalized = normalizeCurrentWeather(
      validPayload({ current: { ...validPayload().current, weather_code: 500 } }),
      FIXED_FETCHED_AT
    );
    assert.equal(normalized.weatherCode, 500);
    assert.equal(normalized.condition, "Unknown");
  });

  it("throws malformed for a non-object payload", () => {
    assert.throws(
      () => normalizeCurrentWeather(null, FIXED_FETCHED_AT),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
    assert.throws(
      () => normalizeCurrentWeather("nope", FIXED_FETCHED_AT),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
  });

  it("throws malformed when the current block is missing", () => {
    assert.throws(
      () => normalizeCurrentWeather({}, FIXED_FETCHED_AT),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
  });

  it("throws malformed for missing required numeric fields", () => {
    const base = validPayload();
    delete (base.current as Record<string, unknown>).temperature_2m;
    assert.throws(
      () => normalizeCurrentWeather(base, FIXED_FETCHED_AT),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "malformed" &&
        /temperature/i.test(error.message)
    );
  });

  it("throws malformed for non-numeric required fields", () => {
    assert.throws(
      () =>
        normalizeCurrentWeather(
          validPayload({
            current: { ...validPayload().current, temperature_2m: "warm" },
          }),
          FIXED_FETCHED_AT
        ),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
  });

  it("throws malformed for NaN temperature", () => {
    assert.throws(
      () =>
        normalizeCurrentWeather(
          validPayload({
            current: { ...validPayload().current, temperature_2m: NaN },
          }),
          FIXED_FETCHED_AT
        ),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
  });

  it("throws malformed when time or timezone is missing", () => {
    const noTime = validPayload();
    delete (noTime.current as Record<string, unknown>).time;
    assert.throws(
      () => normalizeCurrentWeather(noTime, FIXED_FETCHED_AT),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "malformed" &&
        /time/i.test(error.message)
    );

    assert.throws(
      () =>
        normalizeCurrentWeather(
          { ...validPayload(), timezone: "" },
          FIXED_FETCHED_AT
        ),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
  });

  it("throws upstream for an Open-Meteo error body", () => {
    assert.throws(
      () =>
        normalizeCurrentWeather(
          { error: true, reason: "Latitude must be in range." },
          FIXED_FETCHED_AT
        ),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "upstream" &&
        error.message.includes("Latitude")
    );
  });
});

const FORECAST_DATES = [
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
];

function validForecastPayload(overrides: Record<string, unknown> = {}) {
  return {
    current: {
      time: "2026-09-22T14:00",
      temperature_2m: 28.4,
      apparent_temperature: 31.1,
      weather_code: 61,
      wind_speed_10m: 12.3,
      precipitation: 0.4,
      rain: 0.4,
      snowfall: 0,
    },
    daily: {
      time: FORECAST_DATES,
      weather_code: [2, 61, 63, 1, 71],
      temperature_2m_max: [32, 30, 29, 31, 28],
      temperature_2m_min: [24, 23, 22, 24, 20],
      precipitation_probability_max: [10, 60, 80, 5, null],
      wind_speed_10m_max: [15, 22, 18, 12, 30],
    },
    timezone: "Asia/Kolkata",
    ...overrides,
  };
}

describe("normalizeDailyForecast", () => {
  it("normalizes a valid daily block into typed forecast entries", () => {
    const forecast = normalizeDailyForecast(validForecastPayload());
    assert.equal(forecast.length, 5);
    assert.deepEqual(
      forecast.map((day) => day.date),
      FORECAST_DATES
    );
    const first = forecast[0];
    assert.equal(first.date, "2026-09-22");
    assert.equal(first.weatherCode, 2);
    assert.equal(first.condition, "Partly cloudy");
    assert.equal(first.temperatureMaxC, 32);
    assert.equal(first.temperatureMinC, 24);
    assert.equal(first.precipitationProbabilityPercent, 10);
    assert.equal(first.windSpeedMaxKmh, 15);
    assert.equal(forecast[1].condition, "Light rain");
    assert.equal(forecast[3].condition, "Mainly clear");
  });

  it("maps precipitation probabilities while keeping null entries", () => {
    const forecast = normalizeDailyForecast(validForecastPayload());
    assert.equal(forecast[4].precipitationProbabilityPercent, null);
  });

  it("returns an empty forecast when the daily block is absent", () => {
    assert.deepEqual(normalizeDailyForecast({ timezone: "Asia/Kolkata" }), []);
    assert.deepEqual(
      normalizeDailyForecast({ current: validPayload().current }),
      []
    );
  });

  it("returns an empty forecast for empty daily series", () => {
    const forecast = normalizeDailyForecast(
      validForecastPayload({
        daily: {
          time: [],
          weather_code: [],
          temperature_2m_max: [],
          temperature_2m_min: [],
        },
      })
    );
    assert.deepEqual(forecast, []);
  });

  it("throws malformed for a non-object payload", () => {
    assert.throws(
      () => normalizeDailyForecast(null),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
    assert.throws(
      () => normalizeDailyForecast("nope"),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
  });

  it("throws malformed when the daily block is not an object", () => {
    for (const daily of [null, "nope", [1, 2, 3], 42]) {
      assert.throws(
        () => normalizeDailyForecast({ daily }),
        (error: unknown) =>
          error instanceof WeatherDataError && error.kind === "malformed",
        JSON.stringify(daily)
      );
    }
  });

  it("throws malformed when required daily series are missing", () => {
    assert.throws(
      () =>
        normalizeDailyForecast(
          validForecastPayload({
            daily: { weather_code: [2], temperature_2m_max: [32], temperature_2m_min: [24] },
          })
        ),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "malformed" &&
        /time/i.test(error.message)
    );
  });

  it("throws malformed for invalid daily values", () => {
    assert.throws(
      () =>
        normalizeDailyForecast(
          validForecastPayload({
            daily: {
              time: FORECAST_DATES,
              weather_code: [2, "many", 3, 4, 5],
              temperature_2m_max: [32, 30, 29, 31, 28],
              temperature_2m_min: [24, 23, 22, 24, 20],
            },
          })
        ),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "malformed" &&
        /weather code/i.test(error.message)
    );

    assert.throws(
      () =>
        normalizeDailyForecast(
          validForecastPayload({
            daily: {
              time: FORECAST_DATES,
              weather_code: [2, 3, 4, 5, 6],
              temperature_2m_max: [32, 30, NaN, 31, 28],
              temperature_2m_min: [24, 23, 22, 24, 20],
            },
          })
        ),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
  });

  it("throws malformed when daily series have mismatched lengths", () => {
    assert.throws(
      () =>
        normalizeDailyForecast(
          validForecastPayload({
            daily: {
              time: FORECAST_DATES.slice(0, 3),
              weather_code: [2, 3, 4, 5, 6],
              temperature_2m_max: [32, 30, 29, 31, 28],
              temperature_2m_min: [24, 23, 22, 24, 20],
            },
          })
        ),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "malformed" &&
        /mismatched/i.test(error.message)
    );
  });

  it("treats missing optional wind and precipitation series as null", () => {
    const forecast = normalizeDailyForecast(
      validForecastPayload({
        daily: {
          time: FORECAST_DATES,
          weather_code: [2, 3, 4, 5, 6],
          temperature_2m_max: [32, 30, 29, 31, 28],
          temperature_2m_min: [24, 23, 22, 24, 20],
        },
      })
    );
    for (const day of forecast) {
      assert.equal(day.windSpeedMaxKmh, null);
      assert.equal(day.precipitationProbabilityPercent, null);
    }
  });

  it("throws upstream for an Open-Meteo error body", () => {
    assert.throws(
      () =>
        normalizeDailyForecast({ error: true, reason: "Latitude is invalid." }),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "upstream" &&
        error.message.includes("Latitude")
    );
  });
});