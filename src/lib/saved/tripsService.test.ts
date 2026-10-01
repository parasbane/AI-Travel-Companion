import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  addPlaceToTrip,
  createTrip,
  deleteTrip,
  getTrip,
  getTripPlaces,
  getTrips,
  removePlaceFromTrip,
} from "./tripsService";
import {
  addPlaceToItinerary,
  createTripDays,
  getItineraryItems,
  getTripDays,
} from "./tripsService";
import type { AddPlaceToTripInput, CreateTripInput } from "./types";

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

const createTripInput: CreateTripInput = {
  title: "Goa Getaway",
  destinationSlug: "goa",
  destinationName: "Goa",
  startDate: "2026-12-01",
  endDate: "2026-12-05",
};

const addPlaceInput: AddPlaceToTripInput = {
  tripId: "local_trip_1",
  placeId: "goa-palolem-beach",
  destinationSlug: "goa",
  placeName: "Palolem Beach",
  placeCategory: "relaxation",
};

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

describe("tripsService input validation", () => {
  test("requires a title", async () => {
    await assert.rejects(
      () => createTrip("user-a", { ...createTripInput, title: "" }),
      /Trip title is required/
    );
  });

  test("requires a destination slug and name", async () => {
    await assert.rejects(
      () => createTrip("user-a", { ...createTripInput, destinationSlug: "" }),
      /destinationSlug is required/
    );
    await assert.rejects(
      () => createTrip("user-a", { ...createTripInput, destinationName: "" }),
      /destinationName is required/
    );
  });

  test("rejects an end date before the start date", async () => {
    await assert.rejects(
      () =>
        createTrip("user-a", {
          ...createTripInput,
          startDate: "2026-12-10",
          endDate: "2026-12-01",
        }),
      /endDate must be on or after startDate/
    );
  });
});

describe("tripsService local fallback", () => {
  test("creates, lists, and deletes a trip", async () => {
    const trip = await createTrip("user-a", createTripInput);

    assert.equal(trip.userId, "user-a");
    assert.equal(trip.status, "planning");
    assert.equal(trip.startDate, "2026-12-01");
    assert.deepEqual(
      (await getTrips("user-a")).map((t) => t.id),
      [trip.id]
    );

    await deleteTrip("user-a", trip.id);

    assert.deepEqual(await getTrips("user-a"), []);
  });

  test("loads a single trip by id", async () => {
    const trip = await createTrip("user-a", createTripInput);

    const loaded = await getTrip("user-a", trip.id);

    assert.equal(loaded?.id, trip.id);
    assert.equal(loaded?.title, "Goa Getaway");
    assert.equal(loaded?.userId, "user-a");
  });

  test("returns null when a trip does not exist", async () => {
    assert.equal(await getTrip("user-a", "missing_trip"), null);
  });

  test("does not load another user's trip", async () => {
    const trip = await createTrip("user-a", createTripInput);

    assert.equal(await getTrip("user-b", trip.id), null);
  });

  test("deleting a trip removes its trip places", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", { ...addPlaceInput, tripId: trip.id });

    await deleteTrip("user-a", trip.id);

    assert.deepEqual(await getTripPlaces("user-a", trip.id), []);
  });

  test("deleting a trip removes its trip days and itinerary items", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", { ...addPlaceInput, tripId: trip.id });
    const days = await createTripDays("user-a", trip.id);
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: addPlaceInput.placeId,
    });

    await deleteTrip("user-a", trip.id);

    assert.deepEqual(await getTripPlaces("user-a", trip.id), []);
    assert.deepEqual(await getTripDays("user-a", trip.id), []);
    assert.deepEqual(await getItineraryItems("user-a", trip.id), []);
    // Local storage parity with Supabase FK cascades: nothing is left behind.
    assert.deepEqual(
      JSON.parse(storage.getItem("ai_travel_trips_user-a") ?? "[]"),
      []
    );
    assert.deepEqual(
      JSON.parse(storage.getItem("ai_travel_trip_places_user-a") ?? "[]"),
      []
    );
    assert.deepEqual(
      JSON.parse(storage.getItem("ai_travel_trip_days_user-a") ?? "[]"),
      []
    );
    assert.deepEqual(
      JSON.parse(storage.getItem("ai_travel_itinerary_items_user-a") ?? "[]"),
      []
    );
  });

  test("adds, lists, and removes a place from a trip", async () => {
    const trip = await createTrip("user-a", createTripInput);
    const place = await addPlaceToTrip("user-a", {
      ...addPlaceInput,
      tripId: trip.id,
    });

    assert.equal(place.userId, "user-a");
    assert.equal(place.sortOrder, 0);
    assert.equal((await getTripPlaces("user-a", trip.id)).length, 1);

    await removePlaceFromTrip("user-a", {
      tripId: trip.id,
      placeId: addPlaceInput.placeId,
    });

    assert.deepEqual(await getTripPlaces("user-a", trip.id), []);
  });

  test("ignores duplicate places within the same trip", async () => {
    const trip = await createTrip("user-a", createTripInput);
    const first = await addPlaceToTrip("user-a", {
      ...addPlaceInput,
      tripId: trip.id,
    });
    const second = await addPlaceToTrip("user-a", {
      ...addPlaceInput,
      tripId: trip.id,
    });

    assert.equal(first.id, second.id);
    assert.equal((await getTripPlaces("user-a", trip.id)).length, 1);
  });

  test("keeps the fallback scoped to the authenticated user", async () => {
    await createTrip("user-a", createTripInput);

    assert.equal((await getTrips("user-b")).length, 0);
  });

  test("does not persist for an unauthenticated caller", async () => {
    await assert.rejects(
      () => createTrip("", createTripInput),
      /Must be signed in/
    );
    await assert.rejects(() => deleteTrip("", "local_trip_1"), /Must be signed in/);
    await assert.rejects(
      () => addPlaceToTrip("", addPlaceInput),
      /Must be signed in/
    );
    await assert.rejects(
      () => removePlaceFromTrip("", { tripId: "t", placeId: "p" }),
      /Must be signed in/
    );
  });
});