import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Place } from "@/lib/places/types";
import { weatherCodeToCondition } from "./weatherCodes";
import type { CurrentWeather, DailyForecast } from "./types";
import {
  buildWeatherMatches,
  classifyForecastDay,
  HEAT_THRESHOLD_C,
  MAX_WEATHER_MATCH_SLOTS,
} from "./weatherMatches";
import {
  celsiusToFahrenheit,
  roundTemperature,
} from "./units";

function makePlace(overrides: Partial<Place>): Place {
  return {
    id: "p-default",
    slug: "default",
    name: "Default Place",
    destination: "Goa",
    destinationSlug: "goa",
    category: "culture",
    description: "A generic place.",
    shortDescription: "Generic.",
    rating: 4.5,
    reviewCount: 100,
    priceLevel: "free",
    address: "Goa",
    coordinates: { latitude: 15.2, longitude: 74.1 },
    imageUrl: "https://example.com/img.jpg",
    tags: [],
    ...overrides,
  };
}

const MUSEUM = makePlace({
  id: "museum",
  slug: "art-museum",
  name: "Goa Art Museum",
  category: "culture",
  description: "A museum with indoor galleries and exhibits.",
  tags: ["Museum", "Art", "History"],
});

const BEACH = makePlace({
  id: "beach",
  slug: "palolem-beach",
  name: "Palolem Beach",
  category: "nature",
  description: "A crescent beach bay with swimming and sunset views.",
  tags: ["Beach", "Sunset", "Scenic", "Swimming"],
});

const FORT = makePlace({
  id: "fort",
  slug: "aguada-fort",
  name: "Fort Aguada",
  category: "attractions",
  description: "A heritage fort with panoramic ocean views.",
  tags: ["Historic Fort", "Landmark"],
});

const CAFE = makePlace({
  id: "cafe",
  slug: "riverside-cafe",
  name: "Riverside Cafe",
  category: "food",
  description: "A cozy cafe serving fresh cuisine.",
  tags: ["Cafe", "Dining"],
});

const TREK = makePlace({
  id: "trek",
  slug: "jungle-trek",
  name: "Jungle Trek",
  category: "adventure",
  description: "A scenic jungle trail for hiking.",
  tags: ["Scenic Trek", "Jungle"],
});

const PLACES: Place[] = [MUSEUM, BEACH, FORT, CAFE, TREK];

function currentWeather(overrides: Partial<CurrentWeather> = {}): CurrentWeather {
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
    fetchedAt: "2026-09-22T14:00:00.000Z",
    ...overrides,
  };
}

function forecastDay(
  date: string,
  code: number,
  overrides: Partial<DailyForecast> = {}
): DailyForecast {
  return {
    date,
    weatherCode: code,
    condition: weatherCodeToCondition(code),
    temperatureMaxC: 30,
    temperatureMinC: 24,
    precipitationProbabilityPercent: null,
    windSpeedMaxKmh: null,
    ...overrides,
  };
}

function fiveDayForecast(): DailyForecast[] {
  return [
    forecastDay("2026-09-22", 61, { precipitationProbabilityPercent: 80 }),
    forecastDay("2026-09-23", 0),
    forecastDay("2026-09-24", 2, { temperatureMaxC: 34 }),
    forecastDay("2026-09-25", 71),
    forecastDay("2026-09-26", 95),
  ];
}

describe("classifyForecastDay", () => {
  it("classifies rain/drizzle/snow/thunder/heavy precipitation as indoor", () => {
    for (const code of [61, 51, 71, 95, 65, 82, 99, 56, 77, 80]) {
      const result = classifyForecastDay({
        weatherCode: code,
        precipitationProbabilityPercent: 50,
        temperatureMaxC: 27,
      });
      assert.equal(result.lean, "indoor", `code ${code} should lean indoor`);
      assert.equal(result.cause, "rain", `code ${code} cause should be rain`);
    }
  });

  it("classifies clear/partly-cloudy conditions as outdoor", () => {
    for (const code of [0, 1, 2, 3]) {
      const result = classifyForecastDay({
        weatherCode: code,
        precipitationProbabilityPercent: 20,
        temperatureMaxC: 27,
      });
      assert.equal(result.lean, "outdoor", `code ${code} should lean outdoor`);
      assert.equal(result.cause, "advisory");
    }
  });

  it("upgrades clear days to indoor when the rain probability is high", () => {
    const result = classifyForecastDay({
      weatherCode: 0,
      precipitationProbabilityPercent: 80,
      temperatureMaxC: 27,
    });
    assert.equal(result.lean, "indoor");
    assert.equal(result.cause, "rain");
  });

  it("classifies fog as balanced (indoor only at high rain probability)", () => {
    const fog = classifyForecastDay({
      weatherCode: 45,
      precipitationProbabilityPercent: 30,
      temperatureMaxC: 25,
    });
    assert.equal(fog.lean, "balanced");
    const heavyFog = classifyForecastDay({
      weatherCode: 48,
      precipitationProbabilityPercent: 70,
      temperatureMaxC: 25,
    });
    assert.equal(heavyFog.lean, "indoor");
  });

  it("classifies high-temperature clear days as indoor (heat)", () => {
    const result = classifyForecastDay({
      weatherCode: 0,
      precipitationProbabilityPercent: 10,
      temperatureMaxC: 38,
    });
    assert.equal(result.lean, "indoor");
    assert.equal(result.cause, "heat");
  });

  it("applies the heat threshold boundary exactly", () => {
    const atBoundary = classifyForecastDay({
      weatherCode: 0,
      precipitationProbabilityPercent: 10,
      temperatureMaxC: HEAT_THRESHOLD_C,
    });
    assert.equal(atBoundary.cause, "heat");
    const below = classifyForecastDay({
      weatherCode: 0,
      precipitationProbabilityPercent: 10,
      temperatureMaxC: HEAT_THRESHOLD_C - 1,
    });
    assert.equal(below.cause, "advisory");
    assert.equal(below.lean, "outdoor");
  });

  it("lets rain take precedence over heat when both apply", () => {
    const result = classifyForecastDay({
      weatherCode: 61,
      precipitationProbabilityPercent: 80,
      temperatureMaxC: 38,
    });
    assert.equal(result.lean, "indoor");
    assert.equal(result.cause, "rain");
  });

  it("handles unknown codes deterministically via the probability signal", () => {
    const none = classifyForecastDay({
      weatherCode: 999,
      precipitationProbabilityPercent: null,
      temperatureMaxC: 27,
    });
    assert.equal(none.lean, "balanced");
    const wet = classifyForecastDay({
      weatherCode: 999,
      precipitationProbabilityPercent: 80,
      temperatureMaxC: 27,
    });
    assert.equal(wet.lean, "indoor");
    const dry = classifyForecastDay({
      weatherCode: 999,
      precipitationProbabilityPercent: 10,
      temperatureMaxC: 27,
    });
    assert.equal(dry.lean, "outdoor");
  });
});

describe("weather-matched ranking (indoor vs outdoor affinity)", () => {
  it("ranks indoor-suitable places first for indoor conditions", () => {
    const slots = buildWeatherMatches({
      places: PLACES,
      current: currentWeather({ weatherCode: 61, condition: "Light rain" }),
      forecast: [forecastDay("2026-09-22", 61, { precipitationProbabilityPercent: 80 })],
      units: "metric",
    });
    const picked = slots[0].picks.map((pick) => pick.place.id);
    assert.ok(
      picked.includes("museum"),
      `museum should be an indoor pick for rain, got ${JSON.stringify(picked)}`
    );
    assert.ok(
      !picked.includes("beach"),
      `beach should not be picked for rainy conditions, got ${JSON.stringify(picked)}`
    );
    assert.equal(picked.length, 3);
  });

  it("ranks outdoor-suitable places first for clear conditions", () => {
    const slots = buildWeatherMatches({
      places: PLACES,
      current: currentWeather({ weatherCode: 0, condition: "Clear sky" }),
      forecast: [forecastDay("2026-09-22", 0)],
      units: "metric",
    });
    const picked = slots[0].picks.map((pick) => pick.place.id);
    assert.ok(
      picked.includes("beach"),
      `beach should be an outdoor pick for clear skies, got ${JSON.stringify(picked)}`
    );
    assert.ok(
      !picked.includes("museum"),
      `museum should not be ranked into clear-sky picks, got ${JSON.stringify(picked)}`
    );
  });

  it("keeps the original catalog order for balanced conditions (tie-break)", () => {
    const slots = buildWeatherMatches({
      places: [MUSEUM, BEACH, FORT],
      current: currentWeather({ weatherCode: 45, condition: "Fog" }),
      forecast: [forecastDay("2026-09-22", 45, { precipitationProbabilityPercent: 30 })],
      units: "metric",
    });
    const picked = slots[0].picks.map((pick) => pick.place.id);
    assert.deepEqual(picked, ["museum", "beach", "fort"]);
  });

  it("picks shade-friendly spots under heat", () => {
    const slots = buildWeatherMatches({
      places: [BEACH, MUSEUM, CAFE],
      current: currentWeather({ weatherCode: 0, condition: "Clear sky", temperatureC: 35 }),
      forecast: [forecastDay("2026-09-22", 0, { temperatureMaxC: 38 })],
      units: "metric",
    });
    const picked = slots[0].picks.map((pick) => pick.place.id);
    assert.ok(picked.indexOf("museum") < picked.indexOf("beach"));
  });
});

describe("buildWeatherMatches", () => {
  it("caps at 3 forecast slots (Today, Tomorrow, +1 day)", () => {
    const slots = buildWeatherMatches({
      places: PLACES,
      current: currentWeather(),
      forecast: fiveDayForecast(),
      units: "metric",
    });
    assert.equal(slots.length, MAX_WEATHER_MATCH_SLOTS);
    assert.equal(slots[0].label, "Today");
    assert.equal(slots[1].label, "Tomorrow");
    assert.notEqual(slots[2].label, "Today");
    assert.notEqual(slots[2].label, "Tomorrow");
    assert.equal(slots[0].date, "2026-09-22");
    assert.equal(slots[1].date, "2026-09-23");
    assert.equal(slots[2].date, "2026-09-24");
  });

  it("never exceeds the available forecast window", () => {
    const one = buildWeatherMatches({
      places: PLACES,
      current: currentWeather(),
      forecast: [forecastDay("2026-09-22", 61)],
      units: "metric",
    });
    assert.equal(one.length, 1);
    const two = buildWeatherMatches({
      places: PLACES,
      current: currentWeather(),
      forecast: [forecastDay("2026-09-22", 61), forecastDay("2026-09-23", 0)],
      units: "metric",
    });
    assert.equal(two.length, 2);
  });

  it("falls back to a single Today slot from current conditions on an empty forecast", () => {
    const slots = buildWeatherMatches({
      places: PLACES,
      current: currentWeather({ weatherCode: 0, condition: "Clear sky" }),
      forecast: [],
      units: "metric",
    });
    assert.equal(slots.length, 1);
    assert.equal(slots[0].label, "Today");
    assert.equal(slots[0].condition, "Clear sky");
    assert.equal(slots[0].date, "2026-09-22");
    assert.equal(slots[0].picks.length, 3);
    assert.ok(slots[0].picks.every((pick) => pick.reason.length > 0));
  });

  it("shows no fabricated picks for an empty places catalog", () => {
    const slots = buildWeatherMatches({
      places: [],
      current: currentWeather(),
      forecast: fiveDayForecast(),
      units: "metric",
    });
    assert.equal(slots.length, MAX_WEATHER_MATCH_SLOTS);
    assert.ok(slots.every((slot) => slot.picks.length === 0));
  });

  it("emits indoor reasons for rainy slots", () => {
    const slots = buildWeatherMatches({
      places: PLACES,
      current: currentWeather({ weatherCode: 61, condition: "Light rain" }),
      forecast: [forecastDay("2026-09-22", 61, { precipitationProbabilityPercent: 80 })],
      units: "metric",
    });
    assert.ok(
      slots[0].picks.every((pick) => pick.reason.startsWith("Indoor highlight")),
      "rainy slot reasons must reference indoor suitability"
    );
  });

  it("emits outdoor reasons for clear slots", () => {
    const slots = buildWeatherMatches({
      places: PLACES,
      current: currentWeather({ weatherCode: 0, condition: "Clear sky" }),
      forecast: [forecastDay("2026-09-22", 0)],
      units: "metric",
    });
    assert.ok(
      slots[0].picks.every((pick) => pick.reason.startsWith("Outdoor highlight")),
      "clear slot reasons must reference outdoor suitability"
    );
  });

  it("handles unknown weather codes without fabricating data", () => {
    const slots = buildWeatherMatches({
      places: PLACES,
      current: currentWeather({ weatherCode: 999, condition: "Unknown" }),
      forecast: [forecastDay("2026-09-22", 999)],
      units: "metric",
    });
    assert.equal(slots.length, 1);
    assert.ok(slots[0].picks.every((pick) => pick.reason.length > 0));
  });

  it("produces byte-identical deterministic output for identical inputs", () => {
    const input = {
      places: PLACES,
      current: currentWeather(),
      forecast: fiveDayForecast(),
      units: "metric" as const,
    };
    const first = buildWeatherMatches(input);
    const second = buildWeatherMatches(input);
    assert.equal(
      JSON.stringify(first),
      JSON.stringify(second),
      "same inputs must produce identical sorted output"
    );
  });

  it("formats temperatures with the °C preference", () => {
    const slots = buildWeatherMatches({
      places: PLACES,
      current: currentWeather(),
      forecast: [
        forecastDay("2026-09-22", 0, {
          temperatureMaxC: 26.7,
          temperatureMinC: 21.3,
        }),
      ],
      units: "metric",
    });
    const expected = `${roundTemperature(26.7, "metric")}° / ${roundTemperature(21.3, "metric")}°`;
    assert.equal(slots[0].temperature, expected);
    assert.match(slots[0].temperature, /^\d+° \/ \d+°$/);
  });

  it("formats temperatures with the °F preference", () => {
    const slots = buildWeatherMatches({
      places: PLACES,
      current: currentWeather(),
      forecast: [
        forecastDay("2026-09-22", 0, {
          temperatureMaxC: 26.7,
          temperatureMinC: 21.3,
        }),
      ],
      units: "imperial",
    });
    const expectedHigh = Math.round(celsiusToFahrenheit(26.7));
    const expectedLow = Math.round(celsiusToFahrenheit(21.3));
    assert.equal(slots[0].temperature, `${expectedHigh}° / ${expectedLow}°`);
    const metric = buildWeatherMatches({
      places: PLACES,
      current: currentWeather(),
      forecast: [
        forecastDay("2026-09-22", 0, {
          temperatureMaxC: 26.7,
          temperatureMinC: 21.3,
        }),
      ],
      units: "metric",
    });
    assert.notEqual(slots[0].temperature, metric[0].temperature);
  });

  it("never mutates the input places or forecast arrays", () => {
    const places = JSON.parse(JSON.stringify(PLACES)) as Place[];
    const forecast = JSON.parse(JSON.stringify(fiveDayForecast())) as DailyForecast[];
    const beforePlaces = JSON.stringify(places);
    const beforeForecast = JSON.stringify(forecast);
    const placeCount = places.length;

    buildWeatherMatches({
      places,
      current: currentWeather(),
      forecast,
      units: "metric",
    });

    assert.equal(JSON.stringify(places), beforePlaces, "places must be unmodified");
    assert.equal(JSON.stringify(forecast), beforeForecast, "forecast must be unmodified");
    assert.equal(places.length, placeCount);
    assert.equal(forecast.length, 5);
  });
});