import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  addPlaceToItinerary,
  addPlaceToTrip,
  createTrip,
  createTripDays,
  getTripPlan,
  getTripPlanReport,
} from "@/lib/saved/tripsService";
import type { CreateTripInput } from "@/lib/saved/types";
import { buildTripFocusSummary, loadTripContext } from "./tripContext";

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

  snapshot(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.values);
  }
}

const createTripInput: CreateTripInput = {
  title: "Goa Getaway",
  destinationSlug: "goa",
  destinationName: "Goa",
  startDate: "2026-12-01",
  endDate: "2026-12-05",
};

const placeA = "goa-palolem-beach";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const storage = new MemoryStorage();

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  Object.assign(globalThis, { localStorage: storage });
  storage.clear();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});

async function createOwnedTrip(userId = "user-a"): Promise<{ tripId: string }> {
  const trip = await createTrip(userId, createTripInput);
  await addPlaceToTrip(userId, {
    tripId: trip.id,
    placeId: placeA,
    destinationSlug: "goa",
    placeName: "Palolem Beach",
    placeCategory: "relaxation",
  });
  const days = await createTripDays(userId, trip.id);
  await addPlaceToItinerary(userId, {
    tripId: trip.id,
    tripDayId: days[0].id,
    placeId: placeA,
  });
  return { tripId: trip.id };
}

describe("loadTripContext", () => {
  test("loads an authenticated user's own trip as plan + report", async () => {
    const { tripId } = await createOwnedTrip();

    const loaded = await loadTripContext("user-a", tripId);

    assert.ok(loaded);
    assert.equal(loaded.tripId, tripId);
    assert.equal(loaded.plan.trip.id, tripId);
    assert.equal(loaded.plan.totalItems, 1);
    assert.equal(loaded.report.tripId, tripId);
    assert.equal(loaded.report.summary.totalItems, 1);
  });

  test("returns the same plan and report as the underlying service calls", async () => {
    const { tripId } = await createOwnedTrip();

    const loaded = await loadTripContext("user-a", tripId);
    const plan = await getTripPlan("user-a", tripId);
    const report = await getTripPlanReport("user-a", tripId);

    assert.ok(loaded);
    assert.deepEqual(loaded.plan, plan);
    assert.deepEqual(loaded.report, report);
  });

  test("returns null for another user's trip", async () => {
    const { tripId } = await createOwnedTrip();

    const loaded = await loadTripContext("user-b", tripId);

    assert.equal(loaded, null);
  });

  test("returns null when the trip does not exist", async () => {
    const loaded = await loadTripContext("user-a", "trip-does-not-exist");

    assert.equal(loaded, null);
  });

  test("returns null for missing or empty identifiers", async () => {
    const { tripId } = await createOwnedTrip();

    assert.equal(await loadTripContext(undefined, undefined), null);
    assert.equal(await loadTripContext("", tripId), null);
    assert.equal(await loadTripContext("user-a", ""), null);
    assert.equal(await loadTripContext("   ", "   "), null);
  });

  test("returns null instead of throwing on storage read failures", async () => {
    const { tripId } = await createOwnedTrip();
    storage.setItem("ai_travel_trips_user-a", "{not-valid-json");

    const loaded = await loadTripContext("user-a", tripId);

    assert.equal(loaded, null);
  });

  test("never mutates storage while loading trip context", async () => {
    const { tripId } = await createOwnedTrip();
    const before = storage.snapshot();

    const loaded = await loadTripContext("user-a", tripId);
    const after = storage.snapshot();

    assert.deepEqual(after, before);
    assert.ok(loaded);
  });
});

describe("buildTripFocusSummary", () => {
  test("summarizes a trip's plan and report deterministically", async () => {
    const { tripId } = await createOwnedTrip();
    const plan = await getTripPlan("user-a", tripId);
    const report = await getTripPlanReport("user-a", tripId);

    assert.ok(plan);
    assert.ok(report);

    const summary = buildTripFocusSummary(plan, report);
    const again = buildTripFocusSummary(plan, report);

    assert.equal(again, summary);
    assert.match(summary, /Goa Getaway/);
    assert.match(summary, /5 days/);
    assert.match(summary, /1 scheduled stop/);
    assert.match(summary, /flags 4 issues/);
  });

  test("stays bounded and never includes issue details or place ids", async () => {
    const { tripId } = await createOwnedTrip();
    const plan = await getTripPlan("user-a", tripId);
    const report = await getTripPlanReport("user-a", tripId);

    assert.ok(plan);
    assert.ok(report);

    const summary = buildTripFocusSummary(plan, report);

    assert.equal(summary.includes(placeA), false);
    assert.equal(summary.includes("empty-day"), false);
    assert.equal(summary.includes("["), false);
  });

  test("handles an empty trip plan without opinionated wording", async () => {
    const trip = await createTrip("user-a", {
      title: "Empty Plan Trip",
      destinationSlug: "jaipur",
      destinationName: "Jaipur",
      startDate: null,
      endDate: null,
    });
    const plan = await getTripPlan("user-a", trip.id);
    const report = await getTripPlanReport("user-a", trip.id);

    assert.ok(plan);
    assert.ok(report);

    const summary = buildTripFocusSummary(plan, report);

    assert.match(summary, /Empty Plan Trip/);
    assert.equal(summary.includes("scheduled stop"), true);
    assert.match(summary, /0 issues/);
  });
});