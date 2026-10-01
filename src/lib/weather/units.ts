import type { CurrentWeather, DailyForecast } from "./types";

export type WeatherUnitSystem = "metric" | "imperial";

export const WEATHER_UNITS_STORAGE_KEY = "ai_travel_weather_units";

export function parseUnitSystem(value: unknown): WeatherUnitSystem {
  return value === "imperial" ? "imperial" : "metric";
}

export function celsiusToFahrenheit(celsius: number): number {
  return celsius * (9 / 5) + 32;
}

export function fahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) * (5 / 9);
}

export function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

export function mphToKmh(mph: number): number {
  return mph / 0.621371;
}

export function mmToInches(mm: number): number {
  return mm / 25.4;
}

export function inchesToMm(inches: number): number {
  return inches * 25.4;
}

export function temperatureUnitSymbol(units: WeatherUnitSystem): string {
  return units === "imperial" ? "°F" : "°C";
}

export function roundTemperature(
  celsius: number,
  units: WeatherUnitSystem
): number {
  return units === "imperial"
    ? Math.round(celsiusToFahrenheit(celsius))
    : Math.round(celsius);
}

export function formatTemperatureC(
  celsius: number,
  units: WeatherUnitSystem
): string {
  return `${roundTemperature(celsius, units)}${temperatureUnitSymbol(units)}`;
}

export function formatForecastHighC(
  celsius: number,
  units: WeatherUnitSystem
): string {
  return `${roundTemperature(celsius, units)}°`;
}

export function formatForecastLowC(
  celsius: number,
  units: WeatherUnitSystem
): string {
  return `Low ${roundTemperature(celsius, units)}°`;
}

export function formatWindKmh(kmh: number, units: WeatherUnitSystem): string {
  return units === "imperial"
    ? `Wind ${Math.round(kmhToMph(kmh))} mph`
    : `Wind ${Math.round(kmh)} km/h`;
}

export function buildPrecipitationText(
  precipitationMm: number | null,
  units: WeatherUnitSystem
): string {
  if (precipitationMm === null) {
    return "Precipitation —";
  }
  if (precipitationMm <= 0) {
    return "No precipitation";
  }
  const value = units === "imperial" ? mmToInches(precipitationMm) : precipitationMm;
  const label = units === "imperial" ? "in" : "mm";
  const formatted =
    units === "imperial"
      ? value < 1
        ? value.toFixed(2)
        : String(Math.round(value))
      : value < 1
        ? value.toFixed(1)
        : String(Math.round(value));
  return `Precipitation ${formatted} ${label}`;
}

export interface CurrentConditionsDisplay {
  temperature: string;
  feelsLike: string;
  wind: string;
  precipitation: string;
}

export function displayCurrentConditions(
  current: CurrentWeather,
  units: WeatherUnitSystem
): CurrentConditionsDisplay {
  return {
    temperature: formatTemperatureC(current.temperatureC, units),
    feelsLike: `Feels like ${formatTemperatureC(current.apparentTemperatureC, units)}`,
    wind: formatWindKmh(current.windSpeedKmh, units),
    precipitation: buildPrecipitationText(current.precipitationMm, units),
  };
}

export interface ForecastDayDisplay {
  date: string;
  condition: string;
  rainProbabilityPercent: number | null;
  high: string;
  low: string;
}

export function displayForecast(
  forecast: readonly DailyForecast[],
  units: WeatherUnitSystem
): ForecastDayDisplay[] {
  return forecast.map((day) => ({
    date: day.date,
    condition: day.condition,
    rainProbabilityPercent: day.precipitationProbabilityPercent,
    high: formatForecastHighC(day.temperatureMaxC, units),
    low: formatForecastLowC(day.temperatureMinC, units),
  }));
}