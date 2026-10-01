import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { GET } from "./route";

const ORIGINAL_FETCH = globalThis.fetch;

function forecastPayload() {
  return {
    current: validPayload().current,
    daily: {
      time: [
        "2026-09-22",
        "2026-09-23",
        "2026-09-24",
        "2026-09-25",
        "2026-09-26",
      ],
      weather_code: [2, 61, 63, 1, 71],
      temperature_2m_max: [32, 30, 29, 31, 28],
      temperature_2m_min: [24, 23, 22, 24, 20],
      precipitation_probability_max: [10, 60, 80, 5, null],
      wind_speed_10m_max: [15, 22, 18, 12, 30],
    },
    timezone: "Asia/Kolkata",
  };
}

function validPayload() {
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
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  }) as Response;
}

function call(slug: string) {
  return GET(
    new Request(`http://localhost/api/destinations/${slug}/weather`, {
      method: "GET",
    }),
    { params: Promise.resolve({ slug }) }
  );
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("GET /api/destinations/[slug]/weather", () => {
  it("returns a typed available envelope for a curated destination", async () => {
    globalThis.fetch = (input, init) => {
      assert.ok(String(input).includes("latitude=15.2993"), String(input));
      assert.ok(String(input).includes("longitude=74.124"), String(input));
      assert.equal(init?.method, "GET");
      return Promise.resolve(jsonResponse(validPayload()));
    };

    const response = await call("goa");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "available");
    assert.deepEqual(body.destination, { slug: "goa", name: "Goa" });
    assert.equal(body.data.temperatureC, 28.4);
    assert.equal(body.data.condition, "Light rain");
    assert.equal(body.data.timezone, "Asia/Kolkata");
    assert.ok(body.data.fetchedAt.length > 0);
  });

  it("normalizes the slug before resolving coordinates", async () => {
    globalThis.fetch = (input) => {
      assert.ok(String(input).includes("latitude=15.2993"), String(input));
      return Promise.resolve(jsonResponse(validPayload()));
    };

    const response = await call("  GOA, India ");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "available");
    assert.equal(body.destination.slug, "goa");
  });

  it("returns 404 with an unknown-destination envelope and never calls the provider", async () => {
    globalThis.fetch = () => {
      throw new Error("provider must not be called for unknown destinations");
    };

    const response = await call("kyoto");
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.status, "unavailable");
    assert.equal(body.reason, "unknown-destination");
    assert.equal(body.destination.name, "Kyoto");
  });

  it("returns an unavailable envelope when the network request fails", async () => {
    globalThis.fetch = () => Promise.reject(new Error("network down"));

    const response = await call("goa");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "unavailable");
    assert.equal(body.reason, "upstream");
    assert.equal(body.destination.name, "Goa");
  });

  it("returns an unavailable envelope for a non-ok upstream response", async () => {
    globalThis.fetch = () => Promise.resolve(new Response("boom", { status: 503 }));

    const response = await call("goa");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "unavailable");
    assert.equal(body.reason, "upstream");
  });

  it("returns an unavailable envelope for a malformed upstream payload", async () => {
    globalThis.fetch = () =>
      Promise.resolve(jsonResponse({ current: null }));

    const response = await call("goa");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "unavailable");
    assert.equal(body.reason, "upstream");
  });

  it("returns an available envelope with a populated forecast", async () => {
    globalThis.fetch = (input) => {
      assert.ok(String(input).includes("daily="), String(input));
      assert.ok(String(input).includes("forecast_days=5"), String(input));
      return Promise.resolve(jsonResponse(forecastPayload()));
    };

    const response = await call("goa");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "available");
    assert.equal(body.forecast.length, 5);
    assert.deepEqual(body.forecast[0], {
      date: "2026-09-22",
      weatherCode: 2,
      condition: "Partly cloudy",
      temperatureMaxC: 32,
      temperatureMinC: 24,
      precipitationProbabilityPercent: 10,
      windSpeedMaxKmh: 15,
    });
    assert.equal(body.forecast[1].condition, "Light rain");
    assert.equal(body.data.temperatureC, 28.4);
  });

  it("returns an empty forecast when the upstream payload has no daily block", async () => {
    globalThis.fetch = () => Promise.resolve(jsonResponse(validPayload()));

    const response = await call("goa");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "available");
    assert.deepEqual(body.forecast, []);
  });

  it("returns an unavailable envelope when the daily block is malformed", async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        jsonResponse({ ...validPayload(), daily: { time: "nope" } })
      );

    const response = await call("goa");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "unavailable");
    assert.equal(body.reason, "upstream");
  });

  it("keeps the unknown-destination 404 behavior with a forecast-capable provider", async () => {
    globalThis.fetch = () => {
      throw new Error("provider must not be called for unknown destinations");
    };

    const response = await call("kyoto");
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.status, "unavailable");
    assert.equal(body.reason, "unknown-destination");
  });
});