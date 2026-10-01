import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPEN_METEO_CURRENT_FIELDS,
  OPEN_METEO_DAILY_FIELDS,
  OPEN_METEO_FORECAST_DAYS,
  OPEN_METEO_URL,
  OpenMeteoWeatherProvider,
  type WeatherProvider,
} from "./openMeteo";
import { WeatherDataError } from "./normalize";

function validPayload() {
  return {
    current: {
      time: "2026-09-22T14:00",
      temperature_2m: 27.1,
      apparent_temperature: 29.0,
      weather_code: 2,
      wind_speed_10m: 9.4,
      precipitation: 0,
      rain: 0,
      snowfall: 0,
    },
    timezone: "Asia/Kolkata",
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  }) as Response;
}

describe("OpenMeteoWeatherProvider", () => {
  it("normalizes a valid upstream response into the typed model", async () => {
    let calledUrl = "";
    const provider: WeatherProvider = new OpenMeteoWeatherProvider(
      (input) => {
        calledUrl = typeof input === "string" ? input : (input as URL).href;
        return Promise.resolve(jsonResponse(validPayload()));
      }
    );

    const weather = await provider.getCurrentWeather(15.2993, 74.124);
    assert.equal(weather.temperatureC, 27.1);
    assert.equal(weather.condition, "Partly cloudy");
    assert.equal(weather.windSpeedKmh, 9.4);
    assert.ok(calledUrl.length > 0);
    assert.ok(weather.fetchedAt.length > 0);
  });

  it("builds the right Open-Meteo request", async () => {
    const captured: { url: string; init?: RequestInit } = { url: "" };
    const provider: WeatherProvider = new OpenMeteoWeatherProvider(
      (input, init) => {
        captured.url = typeof input === "string" ? input : (input as URL).href;
        captured.init = init;
        return Promise.resolve(jsonResponse(validPayload()));
      }
    );

    await provider.getCurrentWeather(35.6762, 139.6503);

    assert.ok(captured.url.startsWith(OPEN_METEO_URL), captured.url);
    const url = new URL(captured.url);
    assert.equal(url.searchParams.get("latitude"), "35.6762");
    assert.equal(url.searchParams.get("longitude"), "139.6503");
    assert.equal(url.searchParams.get("current"), OPEN_METEO_CURRENT_FIELDS);
    assert.equal(url.searchParams.get("timezone"), "auto");
    assert.equal(url.searchParams.get("forecast_days"), "1");
    assert.equal(captured.init?.method, "GET");
    assert.equal(
      (captured.init?.headers as Record<string, string>)?.accept,
      "application/json"
    );
  });

  it("throws upstream when the provider returns a non-ok status", async () => {
    const provider: WeatherProvider = new OpenMeteoWeatherProvider(
      () => Promise.resolve(new Response("boom", { status: 503 }))
    );

    await assert.rejects(
      provider.getCurrentWeather(15.2993, 74.124),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "upstream"
    );
  });

  it("throws upstream when the network request fails", async () => {
    const provider: WeatherProvider = new OpenMeteoWeatherProvider(() =>
      Promise.reject(new Error("socket hang up"))
    );

    await assert.rejects(
      provider.getCurrentWeather(15.2993, 74.124),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "upstream" &&
        /socket hang up/i.test(error.message)
    );
  });

  it("throws upstream when the response body is not JSON", async () => {
    const provider: WeatherProvider = new OpenMeteoWeatherProvider(() =>
      Promise.resolve(new Response("<html>bad</html>", { status: 200 }))
    );

    await assert.rejects(
      provider.getCurrentWeather(15.2993, 74.124),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "upstream"
    );
  });

  it("throws malformed when the payload shape is wrong despite HTTP 200", async () => {
    const provider: WeatherProvider = new OpenMeteoWeatherProvider(() =>
      Promise.resolve(jsonResponse({ current: null }))
    );

    await assert.rejects(
      provider.getCurrentWeather(15.2993, 74.124),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
  });

  it("throws upstream for an Open-Meteo error body", async () => {
    const provider: WeatherProvider = new OpenMeteoWeatherProvider(() =>
      Promise.resolve(jsonResponse({ error: true, reason: "Bad latitude." }))
    );

    await assert.rejects(
      provider.getCurrentWeather(999, 0),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "upstream" &&
        /Bad latitude/i.test(error.message)
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

function validForecastPayload() {
  return {
    current: validPayload().current,
    daily: {
      time: FORECAST_DATES,
      weather_code: [2, 61, 63, 1, 71],
      temperature_2m_max: [32, 30, 29, 31, 28],
      temperature_2m_min: [24, 23, 22, 24, 20],
      precipitation_probability_max: [10, 60, 80, 5, null],
      wind_speed_10m_max: [15, 22, 18, 12, 30],
    },
    timezone: "Asia/Kolkata",
  };
}

function forecastProvider(
  respond: (input: RequestInfo | URL, init: RequestInit | undefined) => Promise<Response>,
  captured: { url: string; init?: RequestInit } = { url: "" }
): OpenMeteoWeatherProvider {
  return new OpenMeteoWeatherProvider((input, init) => {
    captured.url = typeof input === "string" ? input : (input as URL).href;
    captured.init = init;
    return respond(input, init);
  });
}

describe("OpenMeteoWeatherProvider forecast", () => {
  it("returns current weather and a typed daily forecast", async () => {
    const provider = forecastProvider(() => Promise.resolve(jsonResponse(validForecastPayload())));

    const result = await provider.getWeatherWithForecast(15.2993, 74.124);
    assert.equal(result.current.temperatureC, 27.1);
    assert.equal(result.current.condition, "Partly cloudy");
    assert.equal(result.forecast.length, 5);
    assert.deepEqual(
      result.forecast.map((day) => day.date),
      FORECAST_DATES
    );
    assert.equal(result.forecast[0].temperatureMaxC, 32);
    assert.equal(result.forecast[1].condition, "Light rain");
    assert.equal(result.forecast[4].precipitationProbabilityPercent, null);
    assert.ok(result.current.fetchedAt.length > 0);
  });

  it("builds a request that requests daily fields for the forecast window", async () => {
    const captured: { url: string; init?: RequestInit } = { url: "" };
    const provider = forecastProvider(
      () => Promise.resolve(jsonResponse(validForecastPayload())),
      captured
    );

    await provider.getWeatherWithForecast(35.6762, 139.6503);

    assert.ok(captured.url.startsWith(OPEN_METEO_URL), captured.url);
    const url = new URL(captured.url);
    assert.equal(url.searchParams.get("latitude"), "35.6762");
    assert.equal(url.searchParams.get("longitude"), "139.6503");
    assert.equal(url.searchParams.get("current"), OPEN_METEO_CURRENT_FIELDS);
    assert.equal(url.searchParams.get("daily"), OPEN_METEO_DAILY_FIELDS);
    assert.equal(
      url.searchParams.get("forecast_days"),
      String(OPEN_METEO_FORECAST_DAYS)
    );
    assert.equal(url.searchParams.get("timezone"), "auto");
    assert.equal(captured.init?.method, "GET");
  });

  it("returns an empty forecast when the payload has no daily block", async () => {
    const provider = forecastProvider(() =>
      Promise.resolve(jsonResponse(validPayload()))
    );

    const result = await provider.getWeatherWithForecast(15.2993, 74.124);
    assert.equal(result.current.temperatureC, 27.1);
    assert.deepEqual(result.forecast, []);
  });

  it("throws malformed for an invalid daily block", async () => {
    const provider = forecastProvider(() =>
      Promise.resolve(jsonResponse({ ...validPayload(), daily: { time: "nope" } }))
    );

    await assert.rejects(
      provider.getWeatherWithForecast(15.2993, 74.124),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "malformed"
    );
  });

  it("throws upstream when the provider returns a non-ok status", async () => {
    const provider = forecastProvider(() =>
      Promise.resolve(new Response("boom", { status: 503 }))
    );

    await assert.rejects(
      provider.getWeatherWithForecast(15.2993, 74.124),
      (error: unknown) =>
        error instanceof WeatherDataError && error.kind === "upstream"
    );
  });

  it("throws upstream when the network request fails", async () => {
    const provider = forecastProvider(() =>
      Promise.reject(new Error("socket hang up"))
    );

    await assert.rejects(
      provider.getWeatherWithForecast(15.2993, 74.124),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "upstream" &&
        /socket hang up/i.test(error.message)
    );
  });

  it("throws upstream for an Open-Meteo error body", async () => {
    const provider = forecastProvider(() =>
      Promise.resolve(jsonResponse({ error: true, reason: "Bad latitude." }))
    );

    await assert.rejects(
      provider.getWeatherWithForecast(999, 0),
      (error: unknown) =>
        error instanceof WeatherDataError &&
        error.kind === "upstream" &&
        /Bad latitude/i.test(error.message)
    );
  });
});