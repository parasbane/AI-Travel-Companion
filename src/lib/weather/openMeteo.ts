import {
  normalizeCurrentWeather,
  normalizeDailyForecast,
  WeatherDataError,
} from "./normalize";
import type { CurrentWeather, WeatherWithForecast } from "./types";

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_CURRENT_FIELDS =
  "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,rain,snowfall";
export const OPEN_METEO_DAILY_FIELDS =
  "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,wind_speed_10m_max";
export const OPEN_METEO_FORECAST_DAYS = 5;
export const OPEN_METEO_TIMEOUT_MS = 8000;

export interface WeatherProvider {
  getCurrentWeather(
    latitude: number,
    longitude: number,
    signal?: AbortSignal
  ): Promise<CurrentWeather>;
  getWeatherWithForecast?(
    latitude: number,
    longitude: number,
    signal?: AbortSignal
  ): Promise<WeatherWithForecast>;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Open-Meteo weather adapter. Isolated behind a small replaceable interface;
 * requires no API key and is the only module aware of the external API shape.
 */
export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly fetcher?: FetchLike;
  private readonly timeoutMs: number;

  constructor(fetcher?: FetchLike, timeoutMs: number = OPEN_METEO_TIMEOUT_MS) {
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }

  async getCurrentWeather(
    latitude: number,
    longitude: number,
    signal?: AbortSignal
  ): Promise<CurrentWeather> {
    const url = this.buildRequestUrl(latitude, longitude);
    url.searchParams.set("current", OPEN_METEO_CURRENT_FIELDS);
    url.searchParams.set("forecast_days", "1");
    const payload = await this.fetchPayload(url, signal);
    return normalizeCurrentWeather(payload, new Date());
  }

  async getWeatherWithForecast(
    latitude: number,
    longitude: number,
    signal?: AbortSignal
  ): Promise<WeatherWithForecast> {
    const url = this.buildRequestUrl(latitude, longitude);
    url.searchParams.set("current", OPEN_METEO_CURRENT_FIELDS);
    url.searchParams.set("daily", OPEN_METEO_DAILY_FIELDS);
    url.searchParams.set(
      "forecast_days",
      String(OPEN_METEO_FORECAST_DAYS)
    );
    const payload = await this.fetchPayload(url, signal);
    return {
      current: normalizeCurrentWeather(payload, new Date()),
      forecast: normalizeDailyForecast(payload),
    };
  }

  private buildRequestUrl(latitude: number, longitude: number): URL {
    const url = new URL(OPEN_METEO_URL);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("timezone", "auto");
    return url;
  }

  private async fetchPayload(url: URL, signal?: AbortSignal): Promise<unknown> {
    const doFetch = this.fetcher ?? globalThis.fetch;
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const activeSignal = signal
      ? AbortSignal.any([timeoutSignal, signal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await doFetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: activeSignal,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new WeatherDataError(
        "upstream",
        `Failed to reach the weather provider: ${detail}`
      );
    }

    if (!response.ok) {
      throw new WeatherDataError(
        "upstream",
        `Weather provider responded with HTTP ${response.status}.`
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WeatherDataError(
        "upstream",
        "Weather provider returned an invalid response body."
      );
    }

    return payload;
  }
}

export const weatherProvider: WeatherProvider = new OpenMeteoWeatherProvider();