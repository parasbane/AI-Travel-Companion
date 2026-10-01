import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isKnownWeatherCode,
  weatherCodeToCondition,
} from "./weatherCodes";

const KNOWN_CODES = [
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 99,
];

describe("weatherCodeToCondition", () => {
  it("maps known WMO codes to human-readable conditions", () => {
    const expected: Record<number, string> = {
      0: "Clear sky",
      1: "Mainly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Fog",
      61: "Light rain",
      63: "Moderate rain",
      65: "Heavy rain",
      71: "Light snowfall",
      80: "Light rain showers",
      95: "Thunderstorm",
      96: "Thunderstorm with light hail",
      99: "Thunderstorm with heavy hail",
    };
    for (const [code, label] of Object.entries(expected)) {
      assert.equal(weatherCodeToCondition(Number(code)), label);
    }
  });

  it("returns Unknown for unmapped codes and never throws", () => {
    assert.equal(weatherCodeToCondition(42), "Unknown");
    assert.equal(weatherCodeToCondition(999), "Unknown");
    assert.equal(weatherCodeToCondition(-1), "Unknown");
  });

  it("maps every standard code to a non-empty label", () => {
    for (const code of KNOWN_CODES) {
      assert.ok(weatherCodeToCondition(code).trim().length > 0, String(code));
      assert.equal(isKnownWeatherCode(code), true, String(code));
    }
  });

  it("is deterministic", () => {
    for (const code of KNOWN_CODES) {
      assert.equal(
        weatherCodeToCondition(code),
        weatherCodeToCondition(code),
        String(code)
      );
    }
  });
});

describe("isKnownWeatherCode", () => {
  it("rejects unknown codes", () => {
    assert.equal(isKnownWeatherCode(42), false);
    assert.equal(isKnownWeatherCode(NaN), false);
  });
});