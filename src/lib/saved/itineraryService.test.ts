import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { addPlaceToTrip, createTrip, removePlaceFromTrip } from "./tripsService";
import {
  addPlaceToItinerary,
  createTripDays,
  getItineraryItems,
  getTripDays,
  getTripPlaces,
  getTripPlan,
  getTripPlanReport,
  moveItineraryItem,
  reconcileTripDays,
  removeItineraryItem,
  reorderItineraryItems,
  updateItineraryItem,
  updateTrip,
} from "./tripsService";
import { buildTripPlan, unassignedTripPlaces } from "./tripPlan";
import { analyzeTripPlan } from "./tripPlanReport";
import type { CreateTripInput, Trip, TripDay, ItineraryItem } from "./types";

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
const placeB = "goa-dudhsagar-waterfalls";

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

describe("trip days", () => {
  test("creates one day per calendar date in the trip range", async () => {
    const trip = await createTrip("user-a", createTripInput);

    const days = await createTripDays("user-a", trip.id);

    assert.equal(days.length, 5);
    assert.deepEqual(
      days.map((d) => ({ dayNumber: d.dayNumber, date: d.date })),
      [
        { dayNumber: 1, date: "2026-12-01" },
        { dayNumber: 2, date: "2026-12-02" },
        { dayNumber: 3, date: "2026-12-03" },
        { dayNumber: 4, date: "2026-12-04" },
        { dayNumber: 5, date: "2026-12-05" },
      ]
    );
  });

  test("is idempotent when run twice", async () => {
    const trip = await createTrip("user-a", createTripInput);

    await createTripDays("user-a", trip.id);
    const days = await createTripDays("user-a", trip.id);

    assert.equal(days.length, 5);
  });

  test("returns no days when the trip has no dates", async () => {
    const trip = await createTrip("user-a", {
      ...createTripInput,
      startDate: null,
      endDate: null,
    });

    const days = await createTripDays("user-a", trip.id);

    assert.deepEqual(days, []);
  });

  test("is inaccessible for a user who does not own the trip", async () => {
    const trip = await createTrip("user-a", createTripInput);

    await assert.rejects(
      () => createTripDays("user-b", trip.id),
      /Trip not found/
    );
  });

  test("rejects unauthenticated callers", async () => {
    await assert.rejects(() => createTripDays("", "trip-1"), /Must be signed in/);
  });
});

describe("reconcileTripDays", () => {
  test("creates missing days for a lengthened range and keeps numbering contiguous", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await createTripDays("user-a", trip.id);
    await updateTrip("user-a", trip.id, {
      startDate: "2026-11-30",
      endDate: "2026-12-05",
    });

    const days = await reconcileTripDays("user-a", trip.id);

    assert.equal(days.length, 6);
    assert.deepEqual(
      days.map((d) => ({ dayNumber: d.dayNumber, date: d.date })),
      [
        { dayNumber: 1, date: "2026-11-30" },
        { dayNumber: 2, date: "2026-12-01" },
        { dayNumber: 3, date: "2026-12-02" },
        { dayNumber: 4, date: "2026-12-03" },
        { dayNumber: 5, date: "2026-12-04" },
        { dayNumber: 6, date: "2026-12-05" },
      ]
    );
  });

  test("removes out-of-range days and their items while preserving in-range days and items", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await createTripDays("user-a", trip.id);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });

    const fiveDays = await getTripDays("user-a", trip.id);
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: fiveDays[0].id,
      placeId: placeA,
    });
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: fiveDays[4].id,
      placeId: placeA,
    });

    await updateTrip("user-a", trip.id, {
      startDate: "2026-12-01",
      endDate: "2026-12-03",
    });
    const days = await reconcileTripDays("user-a", trip.id);

    assert.equal(days.length, 3);
    assert.deepEqual(
      days.map((d) => ({ dayNumber: d.dayNumber, date: d.date })),
      [
        { dayNumber: 1, date: "2026-12-01" },
        { dayNumber: 2, date: "2026-12-02" },
        { dayNumber: 3, date: "2026-12-03" },
      ]
    );

    const items = await getItineraryItems("user-a", trip.id);
    assert.equal(items.length, 1);
    assert.equal(items[0].placeId, placeA);
    assert.equal(items[0].tripDayId, days[0].id);
  });

  test("renumbers remaining days after a shift at the start of the range", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await createTripDays("user-a", trip.id);
    await updateTrip("user-a", trip.id, {
      startDate: "2026-12-03",
      endDate: "2026-12-05",
    });

    const days = await reconcileTripDays("user-a", trip.id);

    assert.deepEqual(
      days.map((d) => ({ dayNumber: d.dayNumber, date: d.date })),
      [
        { dayNumber: 1, date: "2026-12-03" },
        { dayNumber: 2, date: "2026-12-04" },
        { dayNumber: 3, date: "2026-12-05" },
      ]
    );
  });

  test("is idempotent — running twice produces the same day set with no duplicates", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await createTripDays("user-a", trip.id);
    await updateTrip("user-a", trip.id, {
      startDate: "2026-11-29",
      endDate: "2026-12-06",
    });
    await reconcileTripDays("user-a", trip.id);

    const again = await reconcileTripDays("user-a", trip.id);

    assert.equal(again.length, 8);
    assert.deepEqual(
      again.map((d) => d.dayNumber),
      [1, 2, 3, 4, 5, 6, 7, 8]
    );
    assert.equal(new Set(again.map((d) => d.date)).size, 8);
  });

  test("is a safe no-op when the trip has no valid dates", async () => {
    const trip = await createTrip("user-a", {
      ...createTripInput,
      startDate: null,
      endDate: null,
    });

    const days = await reconcileTripDays("user-a", trip.id);

    assert.deepEqual(days, []);
  });

  test("rejects unauthenticated callers", async () => {
    await assert.rejects(() => reconcileTripDays("", "trip-1"), /Must be signed in/);
  });

  test("is inaccessible for a user who does not own the trip", async () => {
    const trip = await createTrip("user-a", createTripInput);

    await assert.rejects(
      () => reconcileTripDays("user-b", trip.id),
      /Trip not found/
    );
  });
});

describe("itinerary items", () => {
  test("adds, lists, and removes an item on a day", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    const days = await createTripDays("user-a", trip.id);
    const day = days[0];

    const item = await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      placeId: placeA,
    });

    assert.equal(item.placeName, "Palolem Beach");
    assert.equal(item.tripDayId, day.id);
    assert.equal(item.sortOrder, 0);
    assert.equal((await getItineraryItems("user-a", trip.id)).length, 1);

    await removeItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
    });

    assert.deepEqual(await getItineraryItems("user-a", trip.id), []);
  });

  test("rejects a place that is not part of the trip", async () => {
    const trip = await createTrip("user-a", createTripInput);
    const days = await createTripDays("user-a", trip.id);

    await assert.rejects(
      () =>
        addPlaceToItinerary("user-a", {
          tripId: trip.id,
          tripDayId: days[0].id,
          placeId: "unknown-place",
        }),
      /Place must be added to the trip first/
    );
  });

  test("rejects a trip day that belongs to another trip", async () => {
    const tripA = await createTrip("user-a", {
      ...createTripInput,
      title: "First Trip",
    });
    const tripB = await createTrip("user-a", {
      ...createTripInput,
      title: "Second Trip",
      startDate: "2027-01-01",
      endDate: "2027-01-03",
    });
    const daysB = await createTripDays("user-a", tripB.id);
    await addPlaceToTrip("user-a", {
      tripId: tripA.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });

    await assert.rejects(
      () =>
        addPlaceToItinerary("user-a", {
          tripId: tripA.id,
          tripDayId: daysB[0].id,
          placeId: placeA,
        }),
      /Trip day does not belong to this trip/
    );
  });

  test("prevents duplicate place assignment on the same day", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    const days = await createTripDays("user-a", trip.id);
    const day = days[0];

    const first = await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      placeId: placeA,
    });
    const second = await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      placeId: placeA,
    });

    assert.equal(first.id, second.id);
    assert.equal((await getItineraryItems("user-a", trip.id)).length, 1);
  });

  test("allows the same place on different days", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    const days = await createTripDays("user-a", trip.id);

    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[1].id,
      placeId: placeA,
    });

    assert.equal((await getItineraryItems("user-a", trip.id)).length, 2);
  });

  test("reorders items within a day", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeB,
      destinationSlug: "goa",
      placeName: "Dudhsagar Waterfalls",
      placeCategory: "nature",
    });
    const days = await createTripDays("user-a", trip.id);
    const day = days[0];

    const first = await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      placeId: placeA,
    });
    const second = await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      placeId: placeB,
    });

    const reordered = await reorderItineraryItems("user-a", trip.id, day.id, [
      second.id,
      first.id,
    ]);

    assert.deepEqual(
      reordered.map((i) => i.placeId),
      [placeB, placeA]
    );
    assert.equal(reordered[0].sortOrder, 0);
    assert.equal(reordered[1].sortOrder, 1);
  });

  test("rejects a reorder whose ids do not match the day", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    const days = await createTripDays("user-a", trip.id);
    const day = days[0];
    const item = await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      placeId: placeA,
    });

    await assert.rejects(
      () =>
        reorderItineraryItems("user-a", trip.id, day.id, [
          item.id,
          "unknown-item",
        ]),
      /does not match/
    );
  });

  test("is scoped to the owning user", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    const days = await createTripDays("user-a", trip.id);

    await assert.rejects(
      () =>
        addPlaceToItinerary("user-b", {
          tripId: trip.id,
          tripDayId: days[0].id,
          placeId: placeA,
        }),
      /Place must be added to the trip first/
    );
    assert.deepEqual(await getItineraryItems("user-b", trip.id), []);
  });

  test("rejects unauthenticated callers", async () => {
    await assert.rejects(
      () =>
        addPlaceToItinerary("", {
          tripId: "t",
          tripDayId: "d",
          placeId: "p",
        }),
      /Must be signed in/
    );
    await assert.rejects(
      () => removeItineraryItem("", { tripId: "t", tripDayId: "d", itemId: "i" }),
      /Must be signed in/
    );
    await assert.rejects(
      () => reorderItineraryItems("", "t", "d", ["i"]),
      /Must be signed in/
    );
  });
});

describe("update itinerary items", () => {
  async function makeItem(
    userId = "user-a",
    placeId = placeA
  ): Promise<{ trip: Trip; day: TripDay; item: ItineraryItem }> {
    const trip = await createTrip(userId, createTripInput);
    await addPlaceToTrip(userId, {
      tripId: trip.id,
      placeId,
      destinationSlug: "goa",
      placeName: placeId === placeA ? "Palolem Beach" : "Dudhsagar Waterfalls",
      placeCategory: placeId === placeA ? "relaxation" : "nature",
    });
    const days = await createTripDays(userId, trip.id);
    const item = await addPlaceToItinerary(userId, {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId,
    });
    return { trip, day: days[0], item };
  }

  test("sets start and end times", async () => {
    const { trip, day, item } = await makeItem();

    const updated = await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      startTime: "10:00",
      endTime: "12:00",
    });

    assert.equal(updated.startTime, "10:00");
    assert.equal(updated.endTime, "12:00");
    assert.deepEqual(await getItineraryItems("user-a", trip.id), [updated]);
  });

  test("sets a stop time", async () => {
    const { trip, day, item } = await makeItem();

    const updated = await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      startTime: "10:00",
    });

    assert.equal(updated.startTime, "10:00");
    assert.equal(updated.endTime, null);
    assert.equal(updated.notes, null);
  });

  test("clears a stop time back to untimed", async () => {
    const { trip, day, item } = await makeItem();
    await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      startTime: "10:00",
    });

    const cleared = await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      startTime: null,
    });

    assert.equal(cleared.startTime, null);
  });

  test("updates notes and trims whitespace", async () => {
    const { trip, day, item } = await makeItem();

    const updated = await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      notes: "  Bring swimwear  ",
    });

    assert.equal(updated.notes, "Bring swimwear");
  });

  test("treats blank notes as null", async () => {
    const { trip, day, item } = await makeItem();
    await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      notes: "some note",
    });

    const cleared = await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      notes: "   ",
    });

    assert.equal(cleared.notes, null);
  });

  test("clears a time slot by passing null", async () => {
    const { trip, day, item } = await makeItem();
    await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      startTime: "09:00",
      endTime: "10:30",
    });

    const cleared = await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      startTime: null,
      endTime: null,
    });

    assert.equal(cleared.startTime, null);
    assert.equal(cleared.endTime, null);
  });

  test("rejects a start time after the end time", async () => {
    const { trip, day, item } = await makeItem();

    await assert.rejects(
      () =>
        updateItineraryItem("user-a", {
          tripId: trip.id,
          tripDayId: day.id,
          itemId: item.id,
          startTime: "12:00",
          endTime: "10:00",
        }),
      /startTime must be on or before endTime/
    );
  });

  test("rejects an invalid time format", async () => {
    const { trip, day, item } = await makeItem();

    await assert.rejects(
      () =>
        updateItineraryItem("user-a", {
          tripId: trip.id,
          tripDayId: day.id,
          itemId: item.id,
          startTime: "25:99",
        }),
      /startTime must be in HH:MM format/
    );
    await assert.rejects(
      () =>
        updateItineraryItem("user-a", {
          tripId: trip.id,
          tripDayId: day.id,
          itemId: item.id,
          endTime: "not-a-time",
        }),
      /endTime must be in HH:MM format/
    );
  });

  test("rejects notes longer than 500 characters", async () => {
    const { trip, day, item } = await makeItem();

    await assert.rejects(
      () =>
        updateItineraryItem("user-a", {
          tripId: trip.id,
          tripDayId: day.id,
          itemId: item.id,
          notes: "x".repeat(501),
        }),
      /500 characters or fewer/
    );
  });

  test("preserves the item's other fields", async () => {
    const { trip, day, item } = await makeItem();

    const updated = await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      startTime: "10:00",
      notes: "notes",
    });

    assert.equal(updated.id, item.id);
    assert.equal(updated.placeId, item.placeId);
    assert.equal(updated.placeName, item.placeName);
    assert.equal(updated.placeCategory, item.placeCategory);
    assert.equal(updated.tripId, trip.id);
    assert.equal(updated.tripDayId, day.id);
    assert.equal(updated.sortOrder, item.sortOrder);
    assert.equal(updated.endTime, null);
  });

  test("persists the update through the localStorage fallback", async () => {
    const { trip, day, item } = await makeItem();

    const updated = await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: day.id,
      itemId: item.id,
      startTime: "09:30",
      endTime: "11:00",
      notes: "persisted",
    });

    const persisted = JSON.parse(
      storage.getItem(`ai_travel_itinerary_items_user-a`) ?? "[]"
    );
    assert.deepEqual(
      persisted.find((i: { id: string }) => i.id === item.id),
      updated
    );
  });

  test("rejects updating another user's item", async () => {
    const { trip, day, item } = await makeItem("user-a");

    await assert.rejects(
      () =>
        updateItineraryItem("user-b", {
          tripId: trip.id,
          tripDayId: day.id,
          itemId: item.id,
          startTime: "10:00",
        }),
      /Trip day does not belong to this trip/
    );
  });

  test("rejects an item that does not exist on the day", async () => {
    const { trip, day } = await makeItem("user-a");

    await assert.rejects(
      () =>
        updateItineraryItem("user-a", {
          tripId: trip.id,
          tripDayId: day.id,
          itemId: "no-such-item",
          startTime: "10:00",
        }),
      /Itinerary item not found/
    );
  });

  test("rejects cross-trip day and cross-trip item references", async () => {
    const tripB = await createTrip("user-a", {
      ...createTripInput,
      title: "Second Trip",
      startDate: "2027-01-01",
      endDate: "2027-01-03",
    });
    const daysB = await createTripDays("user-a", tripB.id);
    const { trip, item } = await makeItem("user-a");

    // A day from another trip cannot be used, even with the item's own trip id.
    await assert.rejects(
      () =>
        updateItineraryItem("user-a", {
          tripId: trip.id,
          tripDayId: daysB[0].id,
          itemId: item.id,
          startTime: "10:00",
        }),
      /Trip day does not belong to this trip/
    );

    // The item itself is not part of another trip requesting it.
    await assert.rejects(
      () =>
        updateItineraryItem("user-a", {
          tripId: tripB.id,
          tripDayId: daysB[0].id,
          itemId: item.id,
          endTime: "12:00",
        }),
      /Itinerary item not found/
    );

    // Nor can it be updated against a valid day that is not its own.
    const otherTripSameRange = await createTrip("user-a", {
      ...createTripInput,
      title: "Third Trip",
    });
    const otherDays = await createTripDays("user-a", otherTripSameRange.id);
    await assert.rejects(
      () =>
        updateItineraryItem("user-a", {
          tripId: otherTripSameRange.id,
          tripDayId: otherDays[1].id,
          itemId: item.id,
          notes: "moved",
        }),
      /Itinerary item not found/
    );
  });

  test("rejects unauthenticated callers", async () => {
    await assert.rejects(
      () =>
        updateItineraryItem("", {
          tripId: "t",
          tripDayId: "d",
          itemId: "i",
          startTime: "10:00",
        }),
      /Must be signed in/
    );
  });
});

describe("move itinerary items", () => {
  async function makeMovedItem(
    userId = "user-a",
    placeId = placeA
  ): Promise<{ trip: Trip; days: TripDay[]; item: ItineraryItem }> {
    const trip = await createTrip(userId, createTripInput);
    await addPlaceToTrip(userId, {
      tripId: trip.id,
      placeId,
      destinationSlug: "goa",
      placeName: placeId === placeA ? "Palolem Beach" : "Dudhsagar Waterfalls",
      placeCategory: placeId === placeA ? "relaxation" : "nature",
    });
    const days = await createTripDays(userId, trip.id);
    const item = await addPlaceToItinerary(userId, {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId,
    });
    return { trip, days, item };
  }

  test("moves an item to another day of the same trip", async () => {
    const { trip, days, item } = await makeMovedItem();

    const moved = await moveItineraryItem("user-a", {
      tripId: trip.id,
      itemId: item.id,
      toTripDayId: days[2].id,
    });

    assert.equal(moved.id, item.id);
    assert.equal(moved.tripDayId, days[2].id);
    assert.notEqual(moved.tripDayId, item.tripDayId);
  });

  test("preserves start time across the move", async () => {
    const { trip, days, item } = await makeMovedItem();
    await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      itemId: item.id,
      startTime: "10:00",
    });

    const moved = await moveItineraryItem("user-a", {
      tripId: trip.id,
      itemId: item.id,
      toTripDayId: days[2].id,
    });

    assert.equal(moved.startTime, "10:00");
  });

  test("preserves end time across the move", async () => {
    const { trip, days, item } = await makeMovedItem();
    await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      itemId: item.id,
      endTime: "12:00",
    });

    const moved = await moveItineraryItem("user-a", {
      tripId: trip.id,
      itemId: item.id,
      toTripDayId: days[2].id,
    });

    assert.equal(moved.endTime, "12:00");
  });

  test("preserves notes across the move", async () => {
    const { trip, days, item } = await makeMovedItem();
    await updateItineraryItem("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      itemId: item.id,
      notes: "Bring swimwear",
    });

    const moved = await moveItineraryItem("user-a", {
      tripId: trip.id,
      itemId: item.id,
      toTripDayId: days[2].id,
    });

    assert.equal(moved.notes, "Bring swimwear");
  });

  test("assigns a valid target-day sort order", async () => {
    const { trip, days, item } = await makeMovedItem();
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeB,
      destinationSlug: "goa",
      placeName: "Dudhsagar Waterfalls",
      placeCategory: "nature",
    });
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[2].id,
      placeId: placeB,
    });

    const moved = await moveItineraryItem("user-a", {
      tripId: trip.id,
      itemId: item.id,
      toTripDayId: days[2].id,
    });

    assert.equal(moved.sortOrder, 1);
  });

  test("updates exactly one existing item", async () => {
    const { trip, days, item } = await makeMovedItem();
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeB,
      destinationSlug: "goa",
      placeName: "Dudhsagar Waterfalls",
      placeCategory: "nature",
    });
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeB,
    });
    const before = await getItineraryItems("user-a", trip.id);

    const moved = await moveItineraryItem("user-a", {
      tripId: trip.id,
      itemId: item.id,
      toTripDayId: days[2].id,
    });

    const after = await getItineraryItems("user-a", trip.id);
    assert.equal(after.length, before.length);
    assert.equal(after.filter((i) => i.id === item.id).length, 1);
    assert.equal(moved.id, item.id);
  });

  test("does not create a duplicate row", async () => {
    const { trip, days, item } = await makeMovedItem();

    const moved = await moveItineraryItem("user-a", {
      tripId: trip.id,
      itemId: item.id,
      toTripDayId: days[2].id,
    });

    const items = await getItineraryItems("user-a", trip.id);
    assert.equal(items.length, 1);
    assert.deepEqual(new Set(items.map((i) => i.id)).size, 1);
    assert.equal(items[0].id, moved.id);
    assert.equal(items[0].tripDayId, days[2].id);
  });

  test("rejects a same-day move", async () => {
    const { trip, days, item } = await makeMovedItem();

    await assert.rejects(
      () =>
        moveItineraryItem("user-a", {
          tripId: trip.id,
          itemId: item.id,
          toTripDayId: days[0].id,
        }),
      /already on this trip day/
    );
  });

  test("rejects a target day belonging to another trip", async () => {
    const { trip, item } = await makeMovedItem();
    const tripB = await createTrip("user-a", {
      ...createTripInput,
      title: "Second Trip",
      startDate: "2027-01-01",
      endDate: "2027-01-03",
    });
    const daysB = await createTripDays("user-a", tripB.id);

    await assert.rejects(
      () =>
        moveItineraryItem("user-a", {
          tripId: trip.id,
          itemId: item.id,
          toTripDayId: daysB[0].id,
        }),
      /Trip day does not belong to this trip/
    );

    // Nor can the item be moved through another trip's id.
    await assert.rejects(
      () =>
        moveItineraryItem("user-a", {
          tripId: tripB.id,
          itemId: item.id,
          toTripDayId: daysB[0].id,
        }),
      /Itinerary item not found/
    );
  });

  test("rejects another user's itinerary item", async () => {
    const { trip, days, item } = await makeMovedItem("user-a");

    await assert.rejects(
      () =>
        moveItineraryItem("user-b", {
          tripId: trip.id,
          itemId: item.id,
          toTripDayId: days[2].id,
        }),
      /Itinerary item not found/
    );
  });

  test("rejects a target day that already contains the same place", async () => {
    const { trip, days, item } = await makeMovedItem();
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[2].id,
      placeId: placeA,
    });

    await assert.rejects(
      () =>
        moveItineraryItem("user-a", {
          tripId: trip.id,
          itemId: item.id,
          toTripDayId: days[2].id,
        }),
      /already assigned to Day 3/
    );
  });

  test("persists through the localStorage fallback", async () => {
    const { trip, days, item } = await makeMovedItem();

    const moved = await moveItineraryItem("user-a", {
      tripId: trip.id,
      itemId: item.id,
      toTripDayId: days[2].id,
    });

    const persisted = JSON.parse(
      storage.getItem(`ai_travel_itinerary_items_user-a`) ?? "[]"
    );
    assert.deepEqual(
      persisted.find((i: { id: string }) => i.id === item.id),
      moved
    );
  });

  test("rejects unauthenticated callers", async () => {
    await assert.rejects(
      () =>
        moveItineraryItem("", {
          tripId: "t",
          itemId: "i",
          toTripDayId: "d",
        }),
      /Must be signed in/
    );
  });

  test("getItineraryItems reflects the new day membership", async () => {
    const { trip, days, item } = await makeMovedItem();

    await moveItineraryItem("user-a", {
      tripId: trip.id,
      itemId: item.id,
      toTripDayId: days[3].id,
    });

    const items = await getItineraryItems("user-a", trip.id);
    const moved = items.find((i) => i.id === item.id);
    assert.equal(moved?.tripDayId, days[3].id);
    assert.deepEqual(
      items.filter((i) => i.tripDayId === item.tripDayId),
      []
    );
  });
});

describe("trip plan snapshot", () => {
  async function makePlannedTrip(userId = "user-a") {
    const trip = await createTrip(userId, createTripInput);
    await addPlaceToTrip(userId, {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    await addPlaceToTrip(userId, {
      tripId: trip.id,
      placeId: placeB,
      destinationSlug: "goa",
      placeName: "Dudhsagar Waterfalls",
      placeCategory: "nature",
    });
    const days = await createTripDays(userId, trip.id);
    return { trip, days };
  }

  test("returns a complete plan for the authenticated user's own trip", async () => {
    const { trip, days } = await makePlannedTrip();
    const item = await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
      startTime: "10:00",
      endTime: "12:00",
      notes: "Bring sunscreen",
    });
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[1].id,
      placeId: placeB,
    });

    const plan = await getTripPlan("user-a", trip.id);

    assert.ok(plan);
    assert.equal(plan.trip.id, trip.id);
    assert.equal(plan.trip.destinationSlug, "goa");
    assert.equal(plan.places.length, 2);
    assert.equal(plan.days.length, 5);
    assert.equal(plan.days[0].count, 1);
    assert.equal(plan.days[0].isEmpty, false);
    assert.equal(plan.days[0].items[0].item.id, item.id);
    assert.equal(plan.days[0].items[0].item.startTime, "10:00");
    assert.equal(plan.days[0].items[0].item.notes, "Bring sunscreen");
    assert.equal(plan.days[0].items[0].timeRange, "10:00 AM – 12:00 PM");
    assert.equal(plan.days[1].count, 1);
    assert.equal(plan.days[1].items[0].item.placeId, placeB);
    assert.equal(plan.totalItems, 2);
    assert.equal(plan.plannedDays, 2);
  });

  test("includes empty days in the plan", async () => {
    const { trip } = await makePlannedTrip();

    const plan = await getTripPlan("user-a", trip.id);

    assert.ok(plan);
    assert.equal(plan.days.length, 5);
    assert.ok(plan.days.every((d) => d.isEmpty && d.count === 0 && d.items.length === 0));
    assert.equal(plan.totalItems, 0);
    assert.equal(plan.plannedDays, 0);
  });

  test("composes the same deterministic plan as buildTripPlan", async () => {
    const { trip, days } = await makePlannedTrip();
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });

    const [places, rawDays, items] = await Promise.all([
      getTripPlaces("user-a", trip.id),
      getTripDays("user-a", trip.id),
      getItineraryItems("user-a", trip.id),
    ]);

    assert.deepEqual(
      await getTripPlan("user-a", trip.id),
      buildTripPlan({ trip, days: rawDays, places, items })
    );
  });

  test("returns null for another user's trip", async () => {
    const { trip } = await makePlannedTrip();

    assert.equal(await getTripPlan("user-b", trip.id), null);
  });

  test("returns null for a trip that does not exist", async () => {
    assert.equal(await getTripPlan("user-a", "missing-trip"), null);
  });

  test("rejects unauthenticated callers", async () => {
    await assert.rejects(
      () => getTripPlan("", "trip-1"),
      /Must be signed in/
    );
  });
});

describe("trip plan report", () => {
  async function makePlannedTrip(userId = "user-a") {
    const trip = await createTrip(userId, createTripInput);
    await addPlaceToTrip(userId, {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    await addPlaceToTrip(userId, {
      tripId: trip.id,
      placeId: placeB,
      destinationSlug: "goa",
      placeName: "Dudhsagar Waterfalls",
      placeCategory: "nature",
    });
    const days = await createTripDays(userId, trip.id);
    return { trip, days };
  }

  test("returns a consistency report for the authenticated user's own trip", async () => {
    const { trip, days } = await makePlannedTrip();
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
      startTime: "10:00",
      endTime: "12:00",
    });

    const report = await getTripPlanReport("user-a", trip.id);

    assert.ok(report);
    assert.equal(report.tripId, trip.id);
    assert.deepEqual(report.summary, {
      totalDays: 5,
      plannedDays: 1,
      emptyDays: 4,
      totalItems: 1,
      unassignedPlaceCount: 1,
      issueCount: 5,
    });
    assert.equal(
      report.issues.filter((i) => i.code === "empty-day").length,
      4
    );
    const unassigned = report.issues.find((i) => i.code === "unassigned-place");
    assert.ok(unassigned);
    assert.equal(unassigned.placeId, placeB);
    assert.match(unassigned.message, /Dudhsagar Waterfalls/);
  });

  test("is consistent with analyzeTripPlan of the trip plan snapshot", async () => {
    const { trip, days } = await makePlannedTrip();
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });

    const plan = await getTripPlan("user-a", trip.id);

    assert.deepEqual(
      await getTripPlanReport("user-a", trip.id),
      plan ? analyzeTripPlan(plan) : null
    );
  });

  test("is read-only and writes nothing to localStorage", async () => {
    const { trip, days } = await makePlannedTrip();
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });

    const before = storage.snapshot();
    const report = await getTripPlanReport("user-a", trip.id);

    assert.ok(report);
    assert.deepEqual(storage.snapshot(), before);
  });

  test("returns null for another user's trip", async () => {
    const { trip } = await makePlannedTrip();

    assert.equal(await getTripPlanReport("user-b", trip.id), null);
  });

  test("returns null for a trip that does not exist", async () => {
    assert.equal(await getTripPlanReport("user-a", "missing-trip"), null);
  });

  test("rejects unauthenticated callers", async () => {
    await assert.rejects(
      () => getTripPlanReport("", "trip-1"),
      /Must be signed in/
    );
  });
});

describe("unassigned places bucket", () => {
  test("identifies places that are not scheduled on any day", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeB,
      destinationSlug: "goa",
      placeName: "Dudhsagar Waterfalls",
      placeCategory: "nature",
    });
    const days = await createTripDays("user-a", trip.id);
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });

    const [places, items] = await Promise.all([
      getTripPlaces("user-a", trip.id),
      getItineraryItems("user-a", trip.id),
    ]);
    const unassigned = unassignedTripPlaces(places, items);

    assert.deepEqual(
      unassigned.map((p) => p.placeId),
      [placeB]
    );
  });

  test("assigning an unassigned place removes it from the bucket and updates summary counts", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeB,
      destinationSlug: "goa",
      placeName: "Dudhsagar Waterfalls",
      placeCategory: "nature",
    });
    const days = await createTripDays("user-a", trip.id);
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });

    const before = unassignedTripPlaces(
      await getTripPlaces("user-a", trip.id),
      await getItineraryItems("user-a", trip.id)
    );
    assert.deepEqual(
      before.map((p) => p.placeId),
      [placeB]
    );

    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[1].id,
      placeId: placeB,
    });

    const after = unassignedTripPlaces(
      await getTripPlaces("user-a", trip.id),
      await getItineraryItems("user-a", trip.id)
    );
    assert.deepEqual(after, []);
    const report = await getTripPlanReport("user-a", trip.id);
    assert.ok(report);
    assert.equal(report.summary.unassignedPlaceCount, 0);
    assert.equal(report.summary.totalItems, 2);
    assert.equal(report.summary.plannedDays, 2);
  });

  test("keeps a place scheduled on multiple days out of the unassigned bucket", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    const days = await createTripDays("user-a", trip.id);
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[1].id,
      placeId: placeA,
    });

    const unassigned = unassignedTripPlaces(
      await getTripPlaces("user-a", trip.id),
      await getItineraryItems("user-a", trip.id)
    );

    assert.deepEqual(unassigned, []);
    assert.equal((await getItineraryItems("user-a", trip.id)).length, 2);
  });
});

describe("removing a place cascades its itinerary items", () => {
  test("removes the place's scheduled entries while keeping other places", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeB,
      destinationSlug: "goa",
      placeName: "Dudhsagar Waterfalls",
      placeCategory: "nature",
    });
    const days = await createTripDays("user-a", trip.id);
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[1].id,
      placeId: placeB,
    });

    await removePlaceFromTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
    });

    assert.deepEqual(
      (await getTripPlaces("user-a", trip.id)).map((p) => p.placeId),
      [placeB]
    );
    const items = await getItineraryItems("user-a", trip.id);
    assert.equal(items.length, 1);
    assert.equal(items[0].placeId, placeB);
    assert.equal(items[0].tripDayId, days[1].id);
  });

  test("persists the cascade through localStorage with no orphaned entries", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeB,
      destinationSlug: "goa",
      placeName: "Dudhsagar Waterfalls",
      placeCategory: "nature",
    });
    const days = await createTripDays("user-a", trip.id);
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeB,
    });

    await removePlaceFromTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
    });

    const persisted = JSON.parse(
      storage.getItem(`ai_travel_itinerary_items_user-a`) ?? "[]"
    ) as ItineraryItem[];
    assert.equal(persisted.length, 1);
    assert.ok(persisted.every((i) => i.placeId !== placeA));
    assert.equal(persisted[0].placeId, placeB);
  });

  test("is a safe no-op when nothing is scheduled for the place", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    await createTripDays("user-a", trip.id);

    await removePlaceFromTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
    });

    assert.deepEqual(await getTripPlaces("user-a", trip.id), []);
    assert.deepEqual(await getItineraryItems("user-a", trip.id), []);
  });

  test("cannot affect another user's trip through a foreign caller", async () => {
    const trip = await createTrip("user-a", createTripInput);
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: placeA,
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    const days = await createTripDays("user-a", trip.id);
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: placeA,
    });

    // Local storage is user-scoped, so a foreign caller's delete is a no-op
    // here and the owning user's data is untouched.
    await removePlaceFromTrip("user-b", {
      tripId: trip.id,
      placeId: placeA,
    });

    assert.equal((await getTripPlaces("user-a", trip.id)).length, 1);
    assert.equal((await getItineraryItems("user-a", trip.id)).length, 1);
  });
});