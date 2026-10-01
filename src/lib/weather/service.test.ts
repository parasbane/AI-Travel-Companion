import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CURATED_DESTINATIONS } from "@/lib/places/curatedData";
import type { WeatherProvider } from "./openMeteo";
import {
  getDestinationWeather,
  resolveDestinationCoordinates,
} from "./service";

const CURATED_SLUGS = ["goa", "tokyo", "paris", "bali"];

function recordingProvider(options: {
  error?: Error;
  calls?: Array<{ latitude: number; longitude: number }>;
}): WeatherProvider {
  return {
    async getCurrentWeather(latitude, longitude) {
      options.calls?.push({ latitude, longitude });
      if (options.error) {
        throw options.error;
      }
      return {
        temperatureC: 26,
        apparentTemperatureC: 28,
        weatherCode: 1,
        condition: "Mainly clear",
        windSpeedKmh: 11,
        precipitationMm: 0,
        rainMm: 0,
        snowfallCm: 0,
        observationTime: "2026-09-22T14:00",
        timezone: "Asia/Kolkata",
        fetchedAt: "2026-09-22T08:00:00.000Z",
      };
    },
  };
}

describe("resolveDestinationCoordinates", () => {
  it("resolves curated destination coordinates from existing data", () => {
    for (const slug of CURATED_SLUGS) {
      const expected = CURATED_DESTINATIONS[slug].info;
      const resolved = resolveDestinationCoordinates(slug);
      assert.ok(resolved, slug);
      assert.equal(resolved.slug, expected.slug);
      assert.equal(resolved.name, expected.name);
      assert.equal(resolved.latitude, expected.coordinates.latitude, slug);
      assert.equal(resolved.longitude, expected.coordinates.longitude, slug);
    }
  });

  it("normalizes the slug before resolution", () => {
    const resolved = resolveDestinationCoordinates("  Goa, India ");
    assert.equal(resolved?.slug, "goa");
    assert.equal(resolved?.name, "Goa");
  });

  it("returns null for destinations without curated coordinates", () => {
    assert.equal(resolveDestinationCoordinates("kyoto"), null);
    assert.equal(resolveDestinationCoordinates(""), null);
    assert.equal(resolveDestinationCoordinates("   "), null);
    assert.equal(resolveDestinationCoordinates("!!!"), null);
  });
});

describe("getDestinationWeather", () => {
  it("returns an available envelope using curated coordinates for every curated destination", async () => {
    for (const slug of CURATED_SLUGS) {
      const calls: Array<{ latitude: number; longitude: number }> = [];
      const result = await getDestinationWeather(slug, recordingProvider({ calls }));
      assert.equal(result.status, "available", slug);
      assert.equal(result.destination.slug, slug, slug);
      assert.equal(
        result.destination.name,
        CURATED_DESTINATIONS[slug].info.name,
        slug
      );
      assert.equal(calls.length, 1, slug);
      assert.deepEqual(calls[0], {
        latitude: CURATED_DESTINATIONS[slug].info.coordinates.latitude,
        longitude: CURATED_DESTINATIONS[slug].info.coordinates.longitude,
      });
    }
  });

  it("returns a safe unknown-destination envelope without calling the provider", async () => {
    const calls: Array<{ latitude: number; longitude: number }> = [];
    const result = await getDestinationWeather("kyoto", recordingProvider({ calls }));

    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "unknown-destination");
    assert.equal(result.destination.name, "Kyoto");
    assert.equal(calls.length, 0);
  });

  it("returns unknown-destination for malformed slugs", async () => {
    for (const slug of ["", "   ", "!!!"]) {
      const result = await getDestinationWeather(slug, recordingProvider({ calls: [] }));
      assert.equal(result.status, "unavailable", slug);
      assert.equal(result.reason, "unknown-destination", slug);
    }
  });

  it("returns an upstream unavailable envelope when the provider throws", async () => {
    const result = await getDestinationWeather(
      "goa",
      recordingProvider({ error: new Error("boom") })
    );

    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "upstream");
    assert.equal(result.destination.name, "Goa");
  });

  it("is deterministic for identical inputs", async () => {
    const provider = {
      async getCurrentWeather() {
        return {
          temperatureC: 30,
          apparentTemperatureC: 32,
          weatherCode: 0,
          condition: "Clear sky",
          windSpeedKmh: 6,
          precipitationMm: 0,
          rainMm: 0,
          snowfallCm: 0,
          observationTime: "2026-09-22T14:00",
          timezone: "Asia/Kolkata",
          fetchedAt: "2026-09-22T08:00:00.000Z",
        };
      },
    } satisfies WeatherProvider;

    const first = await getDestinationWeather("goa", provider);
    const second = await getDestinationWeather("goa", provider);
    assert.deepEqual(first, second);
  });
});

const SAMPLE_FORECAST = [
  {
    date: "2026-09-22",
    weatherCode: 2,
    condition: "Partly cloudy",
    temperatureMaxC: 32,
    temperatureMinC: 24,
    precipitationProbabilityPercent: 10,
    windSpeedMaxKmh: 15,
  },
];

function forecastRecordingProvider(options: {
  error?: Error;
  calls?: Array<{ latitude: number; longitude: number }>;
}): WeatherProvider {
  return {
    async getCurrentWeather(latitude, longitude) {
      options.calls?.push({ latitude, longitude });
      if (options.error) {
        throw options.error;
      }
      return {
        temperatureC: 26,
        apparentTemperatureC: 28,
        weatherCode: 1,
        condition: "Mainly clear",
        windSpeedKmh: 11,
        precipitationMm: 0,
        rainMm: 0,
        snowfallCm: 0,
        observationTime: "2026-09-22T14:00",
        timezone: "Asia/Kolkata",
        fetchedAt: "2026-09-22T08:00:00.000Z",
      };
    },
    async getWeatherWithForecast(latitude, longitude) {
      options.calls?.push({ latitude, longitude });
      if (options.error) {
        throw options.error;
      }
      return {
        current: {
          temperatureC: 26,
          apparentTemperatureC: 28,
          weatherCode: 1,
          condition: "Mainly clear",
          windSpeedKmh: 11,
          precipitationMm: 0,
          rainMm: 0,
          snowfallCm: 0,
          observationTime: "2026-09-22T14:00",
          timezone: "Asia/Kolkata",
          fetchedAt: "2026-09-22T08:00:00.000Z",
        },
        forecast: SAMPLE_FORECAST,
      };
    },
  };
}

describe("getDestinationWeather forecast", () => {
  it("attaches the provider forecast to the available envelope", async () => {
    for (const slug of CURATED_SLUGS) {
      const calls: Array<{ latitude: number; longitude: number }> = [];
      const result = await getDestinationWeather(
        slug,
        forecastRecordingProvider({ calls })
      );
      assert.equal(result.status, "available", slug);
      assert.equal(result.forecast.length, 1, slug);
      assert.deepEqual(result.forecast[0], SAMPLE_FORECAST[0], slug);
      assert.equal(result.data.temperatureC, 26, slug);
      assert.deepEqual(calls, [
        {
          latitude: CURATED_DESTINATIONS[slug].info.coordinates.latitude,
          longitude: CURATED_DESTINATIONS[slug].info.coordinates.longitude,
        },
      ]);
    }
  });

  it("degrades to an empty forecast when the provider only supports current weather", async () => {
    const result = await getDestinationWeather(
      "goa",
      recordingProvider({ calls: [] })
    );

    assert.equal(result.status, "available");
    assert.deepEqual(result.forecast, []);
    assert.equal(result.data.temperatureC, 26);
  });

  it("returns an upstream unavailable envelope when the forecast provider throws", async () => {
    const result = await getDestinationWeather(
      "goa",
      forecastRecordingProvider({ error: new Error("boom") })
    );

    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "upstream");
    assert.equal(result.destination.name, "Goa");
  });

  it("does not call the provider for unknown destinations", async () => {
    const calls: Array<{ latitude: number; longitude: number }> = [];
    const result = await getDestinationWeather(
      "kyoto",
      forecastRecordingProvider({ calls })
    );

    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "unknown-destination");
    assert.equal(calls.length, 0);
  });
});