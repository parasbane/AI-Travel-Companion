import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CurrentWeather, DailyForecast } from "./types";
import {
  buildPrecipitationText,
  celsiusToFahrenheit,
  displayCurrentConditions,
  displayForecast,
  fahrenheitToCelsius,
  formatForecastHighC,
  formatForecastLowC,
  formatTemperatureC,
  formatWindKmh,
  inchesToMm,
  kmhToMph,
  mmToInches,
  mphToKmh,
  parseUnitSystem,
  roundTemperature,
  temperatureUnitSymbol,
} from "./units";

function assertClose(actual: number, expected: number, eps = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${actual} to be within ${eps} of ${expected}`,
  );
}

function currentWeatherFixture(): CurrentWeather {
  return {
    temperatureC: 26,
    apparentTemperatureC: 28,
    weatherCode: 61,
    condition: "Light rain",
    windSpeedKmh: 12,
    precipitationMm: 0.4,
    rainMm: 0.4,
    snowfallCm: 0,
    observationTime: "2026-09-22T14:00",
    timezone: "Asia/Kolkata",
    fetchedAt: "2026-09-22T08:00:00.000Z",
  };
}

function forecastFixture(): DailyForecast[] {
  return [
    {
      date: "2026-09-22",
      weatherCode: 61,
      condition: "Light rain",
      temperatureMaxC: 31.4,
      temperatureMinC: 24.8,
      precipitationProbabilityPercent: 67,
      windSpeedMaxKmh: 15,
    },
    {
      date: "2026-09-23",
      weatherCode: 3,
      condition: "Overcast",
      temperatureMaxC: 29,
      temperatureMinC: 23,
      precipitationProbabilityPercent: null,
      windSpeedMaxKmh: null,
    },
  ];
}

describe("parseUnitSystem", () => {
  it("defaults to metric when nothing is stored", () => {
    assert.equal(parseUnitSystem(undefined), "metric");
    assert.equal(parseUnitSystem(null), "metric");
    assert.equal(parseUnitSystem(""), "metric");
  });

  it("returns imperial for a persisted imperial value", () => {
    assert.equal(parseUnitSystem("imperial"), "imperial");
  });

  it("returns metric for a persisted metric value", () => {
    assert.equal(parseUnitSystem("metric"), "metric");
  });

  it("falls back to metric for invalid persisted values", () => {
    assert.equal(parseUnitSystem("garbage"), "metric");
    assert.equal(parseUnitSystem("FAHRENHEIT"), "metric");
    assert.equal(parseUnitSystem("0"), "metric");
    assert.equal(parseUnitSystem(0), "metric");
    assert.equal(parseUnitSystem(""), "metric");
  });
});

describe("temperature conversion", () => {
  it("converts Celsius to Fahrenheit", () => {
    assert.equal(celsiusToFahrenheit(0), 32);
    assert.equal(celsiusToFahrenheit(20), 68);
    assert.equal(celsiusToFahrenheit(100), 212);
    assert.equal(celsiusToFahrenheit(-40), -40);
  });

  it("converts Fahrenheit to Celsius", () => {
    assert.equal(fahrenheitToCelsius(32), 0);
    assert.equal(fahrenheitToCelsius(68), 20);
    assert.equal(fahrenheitToCelsius(212), 100);
    assert.equal(fahrenheitToCelsius(-40), -40);
  });

  it("rounds temperatures to whole numbers for display", () => {
    assert.equal(roundTemperature(26, "metric"), 26);
    assert.equal(roundTemperature(31.4, "metric"), 31);
    assert.equal(roundTemperature(26, "imperial"), 79);
    assert.equal(roundTemperature(31.4, "imperial"), 89);
    assert.equal(temperatureUnitSymbol("metric"), "°C");
    assert.equal(temperatureUnitSymbol("imperial"), "°F");
  });
});

describe("wind speed conversion", () => {
  it("converts km/h to mph", () => {
    assertClose(kmhToMph(10), 6.21371);
    assertClose(kmhToMph(12), 7.456452);
  });

  it("converts mph to km/h", () => {
    assertClose(mphToKmh(10), 16.09344, 1e-4);
  });

  it("round-trips through both directions", () => {
    assertClose(mphToKmh(kmhToMph(20)), 20, 1e-9);
    assertClose(kmhToMph(mphToKmh(20)), 20, 1e-9);
  });
});

describe("precipitation conversion", () => {
  it("converts mm to inches", () => {
    assertClose(mmToInches(25.4), 1);
    assertClose(mmToInches(3.7), 0.145669, 1e-5);
  });

  it("converts inches to mm", () => {
    assertClose(inchesToMm(1), 25.4);
    assertClose(inchesToMm(0.145669), 3.7, 1e-4);
  });
});

describe("current weather display", () => {
  it("keeps existing metric values unchanged", () => {
    assert.equal(formatTemperatureC(26, "metric"), "26°C");
    assert.equal(formatTemperatureC(-40, "metric"), "-40°C");
    assert.equal(formatWindKmh(12, "metric"), "Wind 12 km/h");
    assert.equal(buildPrecipitationText(0.4, "metric"), "Precipitation 0.4 mm");
    assert.equal(buildPrecipitationText(5, "metric"), "Precipitation 5 mm");
    assert.equal(buildPrecipitationText(0, "metric"), "No precipitation");
    assert.equal(buildPrecipitationText(null, "metric"), "Precipitation —");
  });

  it("converts current conditions to imperial", () => {
    const display = displayCurrentConditions(currentWeatherFixture(), "imperial");
    assert.equal(display.temperature, "79°F");
    assert.equal(display.feelsLike, "Feels like 82°F");
    assert.equal(display.wind, "Wind 7 mph");
    assert.equal(display.precipitation, "Precipitation 0.02 in");
  });

  it("shows imperial precipitation with compact precision", () => {
    assert.equal(buildPrecipitationText(25.4, "imperial"), "Precipitation 1 in");
    assert.equal(buildPrecipitationText(0, "imperial"), "No precipitation");
    assert.equal(buildPrecipitationText(null, "imperial"), "Precipitation —");
  });

  it("does not mutate the source current weather", () => {
    const source = currentWeatherFixture();
    const before = JSON.stringify(source);
    displayCurrentConditions(source, "imperial");
    displayCurrentConditions(source, "metric");
    assert.equal(JSON.stringify(source), before);
  });
});

describe("forecast display", () => {
  it("converts forecast temperatures to imperial", () => {
    const display = displayForecast(forecastFixture(), "imperial");
    assert.equal(display[0].high, "89°");
    assert.equal(display[0].low, "Low 77°");
    assert.equal(display[1].high, "84°");
    assert.equal(display[1].low, "Low 73°");
  });

  it("keeps metric forecast values unchanged", () => {
    const display = displayForecast(forecastFixture(), "metric");
    assert.equal(display[0].high, "31°");
    assert.equal(display[0].low, "Low 25°");
    assert.equal(display[0].rainProbabilityPercent, 67);
    assert.equal(display[0].condition, "Light rain");
    assert.equal(display[1].rainProbabilityPercent, null);
  });

  it("does not mutate the source forecast data", () => {
    const source = forecastFixture();
    const before = JSON.stringify(source);
    displayForecast(source, "imperial");
    displayForecast(source, "metric");
    assert.equal(JSON.stringify(source), before);
  });

  it("formats single days exactly like the existing UI", () => {
    assert.equal(formatForecastHighC(31.4, "metric"), "31°");
    assert.equal(formatForecastLowC(24.8, "metric"), "Low 25°");
  });
});