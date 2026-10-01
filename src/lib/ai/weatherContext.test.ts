import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  CurrentWeather,
  DailyForecast,
  DestinationWeatherResponse,
} from "@/lib/weather/types";
import {
  MAX_AI_FORECAST_DAYS,
  buildAiWeatherContext,
  buildDayWeatherNote,
  buildWeatherSummaryLine,
  forecastDayForDate,
  isWeatherRelevantQuestion,
} from "./weatherContext";

function makeCurrent(overrides: Partial<CurrentWeather> = {}): CurrentWeather {
  return {
    temperatureC: 25,
    apparentTemperatureC: 28,
    weatherCode: 61,
    condition: "Light rain",
    windSpeedKmh: 12,
    precipitationMm: 2.1,
    rainMm: 2.1,
    snowfallCm: null,
    observationTime: "2026-09-24T10:00:00Z",
    timezone: "Asia/Kolkata",
    fetchedAt: "2026-09-24T10:05:00Z",
    ...overrides,
  };
}

function makeForecastDay(date: string, overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    date,
    weatherCode: 61,
    condition: "Moderate rain",
    temperatureMaxC: 27,
    temperatureMinC: 24,
    precipitationProbabilityPercent: 90,
    windSpeedMaxKmh: 20,
    ...overrides,
  };
}

function makeAvailableResponse(overrides: {
  current?: Partial<CurrentWeather>;
  forecast?: DailyForecast[];
  destination?: { slug: string; name: string };
} = {}): DestinationWeatherResponse {
  return {
    status: "available",
    destination: overrides.destination ?? { slug: "goa", name: "Goa" },
    data: makeCurrent(overrides.current),
    forecast:
      overrides.forecast ??
      [
        makeForecastDay("2026-09-24"),
        makeForecastDay("2026-09-25", {
          condition: "Clear sky",
          weatherCode: 1,
          precipitationProbabilityPercent: 5,
          temperatureMaxC: 31,
          temperatureMinC: 26,
        }),
      ],
  };
}

describe("buildAiWeatherContext", () => {
  it("normalizes an available envelope into a primitives-only AI context", () => {
    const weather = buildAiWeatherContext(makeAvailableResponse());
    assert.ok(weather);
    assert.equal(weather.destinationSlug, "goa");
    assert.equal(weather.destinationName, "Goa");
    assert.equal(weather.retrievedAt, "2026-09-24T10:05:00Z");

    assert.deepEqual(weather.current, {
      condition: "Light rain",
      conditionCode: 61,
      temperatureC: 25,
      apparentTemperatureC: 28,
      observedAt: "2026-09-24T10:00:00Z",
    });

    assert.equal(weather.forecast.length, 2);
    assert.deepEqual(weather.forecast[0], {
      date: "2026-09-24",
      dayLabel: "Thursday",
      condition: "Moderate rain",
      conditionCode: 61,
      highC: 27,
      lowC: 24,
      precipitationProbabilityPercent: 90,
    });
    assert.match(weather.summary, /^\S/);
  });

  it("bounds the forecast to MAX_AI_FORECAST_DAYS when the provider returns more", () => {
    const forecast = Array.from({ length: MAX_AI_FORECAST_DAYS + 3 }).map((_, index) =>
      makeForecastDay(`2026-10-${String(index + 1).padStart(2, "0")}`)
    );
    const weather = buildAiWeatherContext(makeAvailableResponse({ forecast }));
    assert.ok(weather);
    assert.equal(weather.forecast.length, MAX_AI_FORECAST_DAYS);
  });

  it("returns null for an unavailable unknown-destination envelope (graceful)", () => {
    const response: DestinationWeatherResponse = {
      status: "unavailable",
      reason: "unknown-destination",
      destination: { slug: "nonexistent", name: "Nonexistent" },
    };
    assert.equal(buildAiWeatherContext(response), null);
  });

  it("returns null for an upstream failure envelope (graceful)", () => {
    const response: DestinationWeatherResponse = {
      status: "unavailable",
      reason: "upstream",
      destination: { slug: "goa", name: "Goa" },
    };
    assert.equal(buildAiWeatherContext(response), null);
  });

  it("copies condition and temperatures exactly from the source (no fabrication)", () => {
    const weather = buildAiWeatherContext(
      makeAvailableResponse({
        current: { condition: "Testing-condition-ABC", temperatureC: 42.7, weatherCode: 999 },
        forecast: [makeForecastDay("2026-09-24", { condition: "Forecast-condition-XYZ", temperatureMaxC: 33.1 })],
      })
    );
    assert.ok(weather);
    assert.equal(weather.current?.condition, "Testing-condition-ABC");
    assert.equal(weather.current?.temperatureC, 42.7);
    assert.equal(weather.current?.conditionCode, 999);
    assert.equal(weather.forecast[0].condition, "Forecast-condition-XYZ");
    assert.equal(weather.forecast[0].highC, 33.1);
  });

  it("normalizes the destination slug", () => {
    const weather = buildAiWeatherContext(
      makeAvailableResponse({ destination: { slug: " Goa, India ", name: "Goa" } })
    );
    assert.ok(weather);
    assert.equal(weather.destinationSlug, "goa");
  });

  it("handles a provider with current-only data (empty forecast)", () => {
    const weather = buildAiWeatherContext(makeAvailableResponse({ forecast: [] }));
    assert.ok(weather);
    assert.deepEqual(weather.forecast, []);
    assert.equal(weather.summary, "In Goa: Currently Light rain at 25°C (feels like 28°C).");
  });

  it("does not mutate the supplied response", () => {
    const response = makeAvailableResponse();
    const snapshot = structuredClone(response);
    buildAiWeatherContext(response);
    assert.deepEqual(response, snapshot);
  });
});

describe("buildWeatherSummaryLine", () => {
  it("produces a deterministic metric summary with a rain probability clause", () => {
    const weather = buildAiWeatherContext(makeAvailableResponse());
    assert.ok(weather);
    assert.equal(
      weather.summary,
      "In Goa: Currently Light rain at 25°C (feels like 28°C). Forecast: Thursday: Moderate rain, 27°C / 24°C, 90% rain; Friday: Clear sky, 31°C / 26°C, 5% rain."
    );
  });

  it("renders without a rain probability clause when that value is absent", () => {
    const forecast = [makeForecastDay("2026-09-24", { precipitationProbabilityPercent: null })];
    const weather = buildAiWeatherContext(makeAvailableResponse({ forecast }));
    assert.ok(weather);
    assert.equal(
      buildWeatherSummaryLine(weather),
      "In Goa: Currently Light rain at 25°C (feels like 28°C). Forecast: Thursday: Moderate rain, 27°C / 24°C."
    );
    assert.equal(weather.forecast[0].precipitationProbabilityPercent, null);
  });

  it("skips the feels-like clause when apparent temperature equals temperature", () => {
    const weather = buildAiWeatherContext(
      makeAvailableResponse({
        current: { temperatureC: 25, apparentTemperatureC: 25 },
        forecast: [],
      })
    );
    assert.ok(weather);
    assert.equal(weather.summary, "In Goa: Currently Light rain at 25°C.");
  });
});

describe("forecastDayForDate", () => {
  it("matches the exact trip calendarDate to a forecast day", () => {
    const weather = buildAiWeatherContext(makeAvailableResponse());
    assert.ok(weather);
    const day = forecastDayForDate(weather, "2026-09-25");
    assert.ok(day);
    assert.equal(day.condition, "Clear sky");
    assert.equal(day.date, "2026-09-25");
  });

  it("returns null for a date with no matching forecast day", () => {
    const weather = buildAiWeatherContext(makeAvailableResponse());
    assert.ok(weather);
    assert.equal(forecastDayForDate(weather, "2026-11-01"), null);
  });

  it("returns null for null weather, a null calendar date, or trailing time", () => {
    assert.equal(forecastDayForDate(null, "2026-09-24"), null);
    assert.equal(forecastDayForDate(null, null), null);
    assert.equal(forecastDayForDate(null, undefined), null);
    const weather = buildAiWeatherContext(makeAvailableResponse());
    assert.ok(weather);
    assert.equal(forecastDayForDate(weather, null), null);
  });
});

describe("buildDayWeatherNote", () => {
  it("produces a factual metric note for a matched day", () => {
    const weather = buildAiWeatherContext(makeAvailableResponse());
    assert.ok(weather);
    assert.equal(
      buildDayWeatherNote(weather, "2026-09-24"),
      "Forecast for this day: Moderate rain, 27°C / 24°C, 90% rain."
    );
    assert.equal(
      buildDayWeatherNote(weather, "2026-09-25"),
      "Forecast for this day: Clear sky, 31°C / 26°C, 5% rain."
    );
  });

  it("returns an empty string when there is no weather or no matching day", () => {
    assert.equal(buildDayWeatherNote(null, "2026-09-24"), "");
    const weather = buildAiWeatherContext(makeAvailableResponse());
    assert.ok(weather);
    assert.equal(buildDayWeatherNote(weather, "2026-11-01"), "");
    assert.equal(buildDayWeatherNote(weather, null), "");
  });
});

describe("isWeatherRelevantQuestion", () => {
  it("flags weather and timing questions as relevant", () => {
    assert.equal(isWeatherRelevantQuestion("Will it rain tomorrow in Goa?"), true);
    assert.equal(isWeatherRelevantQuestion("Plan a rainy day for my Goa trip"), true);
    assert.equal(isWeatherRelevantQuestion("Is it too hot for a beach day?"), true);
    assert.equal(isWeatherRelevantQuestion("What is the forecast for this week?"), true);
    assert.equal(isWeatherRelevantQuestion("Where should we go tonight if it storms?"), true);
  });

  it("does not flag plain non-weather questions", () => {
    assert.equal(isWeatherRelevantQuestion("What is the best restaurant for dinner?"), false);
    assert.equal(isWeatherRelevantQuestion("Compare the top two temples"), false);
    assert.equal(isWeatherRelevantQuestion(""), false);
  });
});