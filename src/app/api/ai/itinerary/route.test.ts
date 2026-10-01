import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  addPlaceToItinerary,
  addPlaceToTrip,
  createTrip,
  createTripDays,
} from "@/lib/saved/tripsService";
import {
  DeterministicItineraryPlanner,
  setDefaultItineraryPlanner,
} from "@/lib/ai/itineraryPlanner";
import type { ItineraryProposal } from "@/lib/ai/itineraryPlanner";
import type { DestinationWeatherResponse } from "@/lib/weather/types";
import { POST, setItineraryRouteWeatherFetcherForTesting } from "./route";

const unavailableWeather: DestinationWeatherResponse = {
  status: "unavailable",
  reason: "upstream",
  destination: { slug: "goa", name: "Goa" },
};

function forecastForTripDates(): DestinationWeatherResponse {
  const dates = [
    { date: "2026-12-01", condition: "Moderate rain", weatherCode: 61, high: 27, low: 24, prob: 90 },
    { date: "2026-12-02", condition: "Clear sky", weatherCode: 1, high: 31, low: 26, prob: 5 },
    { date: "2026-12-03", condition: "Light rain", weatherCode: 63, high: 28, low: 24, prob: 70 },
    { date: "2026-12-04", condition: "Cloudy", weatherCode: 3, high: 30, low: 25, prob: 30 },
    { date: "2026-12-05", condition: "Thunderstorm", weatherCode: 95, high: 26, low: 23, prob: 95 },
  ];
  return {
    status: "available",
    destination: { slug: "goa", name: "Goa" },
    data: {
      temperatureC: 25,
      apparentTemperatureC: 28,
      weatherCode: 61,
      condition: "Light rain",
      windSpeedKmh: 12,
      precipitationMm: 2.1,
      rainMm: 2.1,
      snowfallCm: null,
      observationTime: "2026-11-20T10:00:00Z",
      timezone: "Asia/Kolkata",
      fetchedAt: "2026-11-20T10:05:00Z",
    },
    forecast: dates.map((d) => ({
      date: d.date,
      weatherCode: d.weatherCode,
      condition: d.condition,
      temperatureMaxC: d.high,
      temperatureMinC: d.low,
      precipitationProbabilityPercent: d.prob,
      windSpeedMaxKmh: null,
    })),
  };
}

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}

const placeA = "goa-palolem-beach";
const placeB = "goa-dudhsagar-waterfalls";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const storage = new MemoryStorage();

function call(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/ai/itinerary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function createGoaTrip(userId = "user-a"): Promise<string> {
  const trip = await createTrip(userId, {
    title: "Goa Getaway",
    destinationSlug: "goa",
    destinationName: "Goa",
    startDate: "2026-12-01",
    endDate: "2026-12-05",
  });
  await addPlaceToTrip(userId, {
    tripId: trip.id,
    placeId: placeA,
    destinationSlug: "goa",
    placeName: "Palolem Beach",
    placeCategory: "relaxation",
    placeRating: 4.7,
    placePriceLevel: "budget",
  });
  await addPlaceToTrip(userId, {
    tripId: trip.id,
    placeId: placeB,
    destinationSlug: "goa",
    placeName: "Dudhsagar Waterfalls",
    placeCategory: "nature",
    placeRating: 4.8,
    placePriceLevel: "budget",
  });
  const days = await createTripDays(userId, trip.id);
  await addPlaceToItinerary(userId, {
    tripId: trip.id,
    tripDayId: days[0].id,
    placeId: placeA,
  });
  return trip.id;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  Object.assign(globalThis, { localStorage: storage });
  storage.clear();
  setDefaultItineraryPlanner(new DeterministicItineraryPlanner());
  setItineraryRouteWeatherFetcherForTesting(async () => unavailableWeather);
});

afterEach(() => {
  setItineraryRouteWeatherFetcherForTesting(null);
  if (originalUrl !== undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (originalKey !== undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
});

describe("POST /api/ai/itinerary validation", () => {
  it("returns INVALID_JSON for a non-object body", async () => {
    const response = await call("not-json");
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "INVALID_JSON");
  });

  it("returns INVALID_REQUEST when tripId is missing", async () => {
    const response = await call({ userId: "user-a" });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "INVALID_REQUEST");
  });

  it("returns UNAUTHORIZED when no userId is provided", async () => {
    const response = await call({ tripId: "trip-1" });
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "UNAUTHORIZED");
  });

  it("rejects unsupported preference values", async () => {
    const response = await call({
      userId: "user-a",
      tripId: "trip-1",
      preferences: { budget: "extreme" },
    });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "INVALID_REQUEST");
  });

  it("rejects non-string instruction and overlong instruction", async () => {
    const badType = await call({ userId: "user-a", tripId: "trip-1", instruction: 42 });
    assert.equal(badType.status, 422);

    const tooLong = await call({
      userId: "user-a",
      tripId: "trip-1",
      instruction: "x".repeat(501),
    });
    assert.equal(tooLong.status, 422);
    const payload = await tooLong.json();
    assert.equal(payload.error.message.includes("characters or fewer"), true);
  });
});

describe("POST /api/ai/itinerary planning", () => {
  it("returns TRIP_NOT_FOUND for a trip the user cannot access", async () => {
    const tripId = await createGoaTrip("user-a");

    const response = await call({ userId: "user-b", tripId });

    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "TRIP_NOT_FOUND");
  });

  it("returns a deterministic proposal built only from owned server data", async () => {
    const tripId = await createGoaTrip("user-a");

    const response = await call({
      requestId: "req_plan_1",
      userId: "user-a",
      tripId,
      instruction: "  Keep it   relaxed ",
      preferences: { styles: ["relaxation"] },
      // A planted, client-supplied place must never leak into the proposal.
      places: [{ placeId: "fake-resort-999", placeName: "Fake Resort" }],
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.requestId, "req_plan_1");
    assert.equal(payload.data.tripId, tripId);
    assert.equal(payload.data.proposal.tripId, tripId);
    assert.equal(payload.data.proposal.source, "deterministic");
    assert.equal(payload.data.proposal.dayCount, 5);
    assert.equal(payload.data.proposal.days.length, 5);
    assert.equal(payload.data.proposal.usedPreferences, true);
    assert.equal(payload.data.proposal.instruction, "Keep it relaxed");

    // Day 1 preserves the scheduled place; suggestions only use the real pool.
    assert.deepEqual(payload.data.proposal.days[0].scheduledPlaceIds, [placeA]);
    assert.equal(payload.data.proposal.days[0].suggestedPlaceIds.includes(placeA), false);

    const allIds = JSON.stringify(payload.data.proposal);
    assert.equal(allIds.includes("fake-resort-999"), false);
    assert.equal(allIds.includes(placeB), true);
  });

  it("suggests every unassigned pool place across the five days", async () => {
    const tripId = await createGoaTrip("user-a");

    const response = await call({ userId: "user-a", tripId });

    assert.equal(response.status, 200);
    const payload = await response.json();
    const suggested = payload.data.proposal.days.flatMap(
      (day: { suggestedPlaceIds: string[] }) => day.suggestedPlaceIds
    );
    assert.deepEqual(new Set(suggested), new Set([placeB]));
    assert.equal(payload.data.proposal.unassignedPlaceIds.length, 0);
  });

  it("returns an empty proposal for a trip with no dates or places", async () => {
    const trip = await createTrip("user-a", {
      title: "Untitled Trip",
      destinationSlug: "goa",
      destinationName: "Goa",
      startDate: null,
      endDate: null,
    });

    const response = await call({ userId: "user-a", tripId: trip.id });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.proposal.dayCount, 0);
    assert.equal(payload.data.proposal.days.length, 0);
    assert.equal(payload.data.proposal.suggestionCount, 0);
    assert.deepEqual(payload.data.proposal.unassignedPlaceIds, []);
  });

  it("annotates each trip day with a grounded forecast note when weather is available", async () => {
    const tripId = await createGoaTrip("user-a");
    setItineraryRouteWeatherFetcherForTesting(async () => forecastForTripDates());

    const response = await call({
      userId: "user-a",
      tripId,
      instruction: "Plan a rainy day for my Goa trip",
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    const proposal: ItineraryProposal = payload.data.proposal;

    assert.equal(proposal.dayCount, 5);
    assert.match(proposal.days[0].reasoning, /Forecast for this day: Moderate rain, 27°C \/ 24°C, 90% rain\./);
    assert.match(proposal.days[1].reasoning, /Forecast for this day: Clear sky, 31°C \/ 26°C, 5% rain\./);
    assert.match(proposal.days[4].reasoning, /Forecast for this day: Thunderstorm, 26°C \/ 23°C, 95% rain\./);

    // Weather never invents values or place data.
    assert.equal(JSON.stringify(proposal).includes("Fake Weather"), false);
    assert.equal(
      proposal.days.some((day) => day.reasoning.includes("TemperatureConditionXYZ")),
      false
    );
  });

  it("keeps reasoning weather-free when weather is unavailable (graceful)", async () => {
    const tripId = await createGoaTrip("user-a");

    const response = await call({ userId: "user-a", tripId });

    assert.equal(response.status, 200);
    const payload = await response.json();
    const proposal: ItineraryProposal = payload.data.proposal;
    for (const day of proposal.days) {
      assert.equal(day.reasoning.includes("Forecast for this day"), false);
    }
    assert.deepEqual(payload.data.proposal.scheduleCount, 1);
    assert.deepEqual(payload.data.proposal.suggestionCount, 1);
  });
});