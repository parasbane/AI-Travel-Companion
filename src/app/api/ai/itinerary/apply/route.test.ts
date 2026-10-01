import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  addPlaceToItinerary,
  addPlaceToTrip,
  applyItineraryPlanToTrip,
  createTrip,
  createTripDays,
  getItineraryItems,
} from "@/lib/saved/tripsService";
import { POST, validateApplyItineraryRequest } from "./route";
import type { ApplyItineraryProposalShape } from "@/lib/ai/applyItineraryPlan";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const placeA = "goa-palolem-beach";
const placeB = "goa-dudhsagar-waterfalls";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let storage = new MemoryStorage();

function call(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/ai/itinerary/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function buildProposal(input: {
  tripId: string;
  days?: { dayNumber: number; scheduledPlaceIds?: string[]; suggestedPlaceIds?: string[] }[];
  unassignedPlaceIds?: string[];
}): ApplyItineraryProposalShape {
  return {
    tripId: input.tripId,
    days: (input.days ?? []).map((day) => ({
      dayNumber: day.dayNumber,
      scheduledPlaceIds: day.scheduledPlaceIds ?? [],
      suggestedPlaceIds: day.suggestedPlaceIds ?? [],
    })),
    unassignedPlaceIds: input.unassignedPlaceIds ?? [],
  };
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
  storage = new MemoryStorage();
  Object.assign(globalThis, { localStorage: storage });
});

afterEach(() => {
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

describe("validateApplyItineraryRequest", () => {
  it("accepts a structurally valid apply request", () => {
    const result = validateApplyItineraryRequest({
      userId: "user-a",
      tripId: "trip_1",
      proposal: {
        tripId: "trip_1",
        title: "Ignored title",
        source: "deterministic",
        days: [
          {
            dayNumber: 1,
            label: "Day 1",
            scheduledPlaceIds: ["a"],
            suggestedPlaceIds: ["b"],
          },
          { dayNumber: 2, suggestedPlaceIds: ["c"] },
        ],
        unassignedPlaceIds: ["d"],
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.tripId, "trip_1");
      assert.equal(result.value.proposal.tripId, "trip_1");
      assert.equal(result.value.proposal.days.length, 2);
      assert.deepEqual(result.value.proposal.days[0].scheduledPlaceIds, ["a"]);
      assert.deepEqual(result.value.proposal.days[1].suggestedPlaceIds, ["c"]);
      assert.deepEqual(result.value.proposal.unassignedPlaceIds, ["d"]);
    }
  });
});

describe("POST /api/ai/itinerary/apply validation", () => {
  it("returns INVALID_JSON for a non-object body", async () => {
    const response = await call("not-json");
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "INVALID_JSON");
  });

  it("returns INVALID_REQUEST when tripId is missing", async () => {
    const response = await call({ userId: "user-a", proposal: {} });
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "INVALID_REQUEST");
  });

  it("returns INVALID_PROPOSAL when the proposal is missing or malformed", async () => {
    const missing = await call({ userId: "user-a", tripId: "trip_1" });
    assert.equal(missing.status, 422);
    assert.equal((await missing.json()).error.code, "INVALID_PROPOSAL");

    const badDays = await call({
      userId: "user-a",
      tripId: "trip_1",
      proposal: { tripId: "trip_1", days: [{ dayNumber: "one" }] },
    });
    assert.equal(badDays.status, 422);
    assert.equal((await badDays.json()).error.code, "INVALID_PROPOSAL");

    const badPlaceIds = await call({
      userId: "user-a",
      tripId: "trip_1",
      proposal: { tripId: "trip_1", days: [], unassignedPlaceIds: [42] },
    });
    assert.equal(badPlaceIds.status, 422);
    assert.equal((await badPlaceIds.json()).error.code, "INVALID_PROPOSAL");
  });

  it("returns UNAUTHORIZED when no userId is provided", async () => {
    const tripId = await createGoaTrip();
    const response = await call({
      tripId,
      proposal: buildProposal({ tripId }),
    });
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "UNAUTHORIZED");
  });
});

describe("POST /api/ai/itinerary/apply success", () => {
  it("returns TRIP_NOT_FOUND for a trip the user cannot access", async () => {
    const tripId = await createGoaTrip("user-a");

    const response = await call({
      userId: "user-b",
      tripId,
      proposal: buildProposal({ tripId }),
    });

    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "TRIP_NOT_FOUND");
  });

  it("applies a valid proposal and persists new itinerary items", async () => {
    const tripId = await createGoaTrip("user-a");

    const response = await call({
      requestId: "req_apply_1",
      userId: "user-a",
      tripId,
      proposal: buildProposal({
        tripId,
        days: [
          { dayNumber: 1, scheduledPlaceIds: [placeA], suggestedPlaceIds: [placeB] },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.requestId, "req_apply_1");
    assert.equal(payload.data.tripId, tripId);
    assert.equal(payload.data.application.addedStopCount, 1);
    assert.equal(payload.data.application.daysApplied, 1);
    assert.equal(payload.data.application.applied[0].placeId, placeB);
    assert.equal(payload.data.application.applied[0].placeName, "Dudhsagar Waterfalls");
    assert.equal(payload.data.application.applied[0].dayNumber, 1);
    assert.ok(payload.data.application.applied[0].itemId);
    assert.equal(payload.data.application.skippedCount, 0);
    assert.deepEqual(payload.data.application.rejectedPlaceIds, []);
    assert.equal(payload.data.application.keptUnassignedCount, 0);
    assert.equal(payload.data.application.preservedScheduledCount, 1);

    const items = await getItineraryItems("user-a", tripId);
    assert.equal(items.length, 2);
    assert.equal(items.some((i) => i.placeId === placeB), true);
    assert.equal(items.filter((i) => i.placeId === placeA).length, 1);
  });

  it("rejects unknown/foreign place IDs and never persists them", async () => {
    const tripId = await createGoaTrip("user-a");

    const response = await call({
      userId: "user-a",
      tripId,
      proposal: buildProposal({
        tripId,
        days: [
          { dayNumber: 1, suggestedPlaceIds: [placeB, "fake-resort-999"] },
        ],
      }),
      // A planted, client-supplied place metadata field must never be trusted.
      places: [{ placeId: "fake-resort-999", placeName: "Fake Resort" }],
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.application.addedStopCount, 1);
    assert.deepEqual(payload.data.application.rejectedPlaceIds, ["fake-resort-999"]);

    const allIds = JSON.stringify(await getItineraryItems("user-a", tripId));
    assert.equal(allIds.includes("fake-resort-999"), false);
    assert.equal(allIds.includes(placeB), true);
  });

  it("skips suggestions that are already scheduled", async () => {
    const tripId = await createGoaTrip("user-a");

    const response = await call({
      userId: "user-a",
      tripId,
      proposal: buildProposal({
        tripId,
        days: [{ dayNumber: 1, suggestedPlaceIds: [placeA] }],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.application.addedStopCount, 0);
    assert.equal(payload.data.application.skippedCount, 1);
  });

  it("applying the same proposal twice is idempotent", async () => {
    const tripId = await createGoaTrip("user-a");
    const body = {
      userId: "user-a",
      tripId,
      proposal: buildProposal({
        tripId,
        days: [{ dayNumber: 1, suggestedPlaceIds: [placeB] }],
      }),
    };

    const first = await call(body);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).data.application.addedStopCount, 1);

    const second = await call(body);
    assert.equal(second.status, 200);
    const payload = await second.json();
    assert.equal(payload.data.application.addedStopCount, 0);
    assert.ok(payload.data.application.skippedCount >= 1);

    const items = await getItineraryItems("user-a", tripId);
    assert.equal(items.length, 2);
    assert.equal(items.filter((i) => i.placeId === placeB).length, 1);
  });

  it("keeps unassigned proposal places unassigned", async () => {
    const tripId = await createGoaTrip("user-a");

    const response = await call({
      userId: "user-a",
      tripId,
      proposal: buildProposal({
        tripId,
        days: [],
        unassignedPlaceIds: [placeB],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.application.addedStopCount, 0);
    assert.equal(payload.data.application.keptUnassignedCount, 1);

    const items = await getItineraryItems("user-a", tripId);
    assert.equal(items.filter((i) => i.placeId === placeB).length, 0);
  });

  it("propagates persistence errors instead of partially applying", async () => {
    const tripId = await createGoaTrip("user-a");

    // A foreign addition (validated at compute time) must be rejected by the
    // persistence layer, and no partial writes may occur.
    await assert.rejects(
      async () =>
        applyItineraryPlanToTrip("user-a", {
          tripId,
          additions: [{ dayNumber: 1, tripDayId: "day_1", placeId: "foreign-resort-999", placeName: "Foreign" }],
        }),
      /Place must be added to the trip first/
    );

    const items = await getItineraryItems("user-a", tripId);
    assert.equal(items.length, 1);
  });
});