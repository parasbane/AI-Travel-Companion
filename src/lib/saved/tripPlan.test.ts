import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildTripPlan, unassignedTripPlaces, type BuildTripPlanInput } from "./tripPlan";
import type { ItineraryItem, Trip, TripDay, TripPlace } from "./types";

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip_1",
    userId: "user-a",
    title: "Goa Getaway",
    destinationSlug: "goa",
    destinationName: "Goa",
    description: null,
    startDate: "2026-12-01",
    endDate: "2026-12-03",
    status: "planning",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDay(overrides: Partial<TripDay> = {}): TripDay {
  return {
    id: `day_${overrides.dayNumber ?? 1}`,
    tripId: "trip_1",
    userId: "user-a",
    dayNumber: 1,
    date: "2026-12-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePlace(overrides: Partial<TripPlace> = {}): TripPlace {
  return {
    id: "tp_1",
    tripId: "trip_1",
    userId: "user-a",
    placeId: "goa-palolem-beach",
    destinationSlug: "goa",
    placeName: "Palolem Beach",
    placeCategory: "relaxation",
    placeImageUrl: null,
    placeRating: 4.7,
    placePriceLevel: "budget",
    notes: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeItem(
  overrides: Partial<ItineraryItem> & { tripDayId: string }
): ItineraryItem {
  const { tripDayId, ...rest } = overrides;
  return {
    id: "item_1",
    tripId: "trip_1",
    tripDayId,
    userId: "user-a",
    placeId: "goa-palolem-beach",
    placeName: "Palolem Beach",
    placeCategory: "relaxation",
    placeImageUrl: null,
    startTime: null,
    endTime: null,
    notes: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...rest,
  };
}

function plan(input: Partial<BuildTripPlanInput> = {}) {
  return buildTripPlan({
    trip: makeTrip(),
    days: [],
    places: [],
    items: [],
    ...input,
  });
}

describe("buildTripPlan", () => {
  test("returns an empty plan for an empty trip", () => {
    const result = plan();

    assert.equal(result.trip.id, "trip_1");
    assert.deepEqual(result.places, []);
    assert.deepEqual(result.days, []);
    assert.equal(result.totalItems, 0);
    assert.equal(result.plannedDays, 0);
  });

  test("builds a single-day plan with its items", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const item = makeItem({ tripDayId: "day_1", placeName: "Palolem Beach" });

    const result = plan({ days: [day1], items: [item] });

    assert.equal(result.days.length, 1);
    const day = result.days[0];
    assert.equal(day.dayNumber, 1);
    assert.equal(day.calendarDate, "2026-12-01");
    assert.equal(day.label, "Dec 1, 2026");
    assert.equal(day.count, 1);
    assert.equal(day.isEmpty, false);
    assert.equal(day.items[0].item.id, item.id);
    assert.equal(result.totalItems, 1);
    assert.equal(result.plannedDays, 1);
  });

  test("sorts days by day number across a multi-day trip", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const day3 = makeDay({ id: "day_3", dayNumber: 3, date: "2026-12-03" });
    const item = makeItem({ tripDayId: "day_3" });

    const result = plan({ days: [day3, day1, day2], items: [item] });

    assert.deepEqual(
      result.days.map((d) => d.dayNumber),
      [1, 2, 3]
    );
  });

  test("orders timed items chronologically within a day", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const items = [
      makeItem({ tripDayId: "day_1", id: "b", startTime: "14:00", sortOrder: 0 }),
      makeItem({ tripDayId: "day_1", id: "a", startTime: "09:00", sortOrder: 1 }),
      makeItem({ tripDayId: "day_1", id: "c", startTime: "19:00", sortOrder: 2 }),
    ];

    const result = plan({ days: [day1], items });

    assert.deepEqual(
      result.days[0].items.map((i) => i.item.id),
      ["a", "b", "c"]
    );
  });

  test("places untimed items after timed items", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const items = [
      makeItem({ tripDayId: "day_1", id: "untimed", sortOrder: 0 }),
      makeItem({ tripDayId: "day_1", id: "timed", startTime: "08:00", sortOrder: 1 }),
    ];

    const result = plan({ days: [day1], items });

    assert.deepEqual(
      result.days[0].items.map((i) => i.item.id),
      ["timed", "untimed"]
    );
  });

  test("formats the time range when times exist", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const item = makeItem({
      tripDayId: "day_1",
      startTime: "10:00",
      endTime: "12:00",
    });

    const result = plan({ days: [day1], items: [item] });

    assert.equal(result.days[0].items[0].timeRange, "10:00 AM – 12:00 PM");
  });

  test("leaves the time range null when no times exist", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const item = makeItem({ tripDayId: "day_1" });

    const result = plan({ days: [day1], items: [item] });

    assert.equal(result.days[0].items[0].timeRange, null);
  });

  test("preserves startTime, endTime, and notes on items", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const item = makeItem({
      tripDayId: "day_1",
      startTime: "09:30",
      endTime: "11:00",
      notes: "Book tickets in advance",
    });

    const result = plan({ days: [day1], items: [item] });
    const planned = result.days[0].items[0].item;

    assert.equal(planned.startTime, "09:30");
    assert.equal(planned.endTime, "11:00");
    assert.equal(planned.notes, "Book tickets in advance");
  });

  test("counts items per day and in total", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const items = [
      makeItem({ tripDayId: "day_1", id: "a" }),
      makeItem({ tripDayId: "day_1", id: "b" }),
      makeItem({ tripDayId: "day_2", id: "c" }),
    ];

    const result = plan({ days: [day1, day2], items });

    assert.equal(result.days[0].count, 2);
    assert.equal(result.days[1].count, 1);
    assert.equal(result.totalItems, 3);
    assert.equal(result.plannedDays, 2);
  });

  test("reports empty days correctly", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const item = makeItem({ tripDayId: "day_1" });

    const result = plan({ days: [day1, day2], items: [item] });

    assert.equal(result.days[0].isEmpty, false);
    assert.equal(result.days[1].isEmpty, true);
    assert.equal(result.days[1].count, 0);
    assert.deepEqual(result.days[1].items, []);
    assert.equal(result.plannedDays, 1);
  });

  test("preserves the trip places pool", () => {
    const places = [makePlace(), makePlace({ placeId: "goa-market", placeName: "Goa Market" })];

    const result = plan({ places });

    assert.equal(result.places.length, 2);
    assert.equal(result.places[0].placeId, "goa-palolem-beach");
  });

  test("does not mutate any input array", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const items = [
      makeItem({ tripDayId: "day_2", id: "b", startTime: "14:00", sortOrder: 1 }),
      makeItem({ tripDayId: "day_1", id: "a", startTime: "09:00", sortOrder: 0 }),
    ];
    const places = [makePlace()];
    const input: BuildTripPlanInput = {
      trip: makeTrip(),
      days: [day2, day1],
      places,
      items,
    };
    const daysCopy = input.days.map((d) => ({ ...d }));
    const itemsCopy = input.items.map((i) => ({ ...i }));
    const placesCopy = input.places.map((p) => ({ ...p }));

    buildTripPlan(input);

    assert.deepEqual(
      input.days.map((d) => ({ ...d })),
      daysCopy
    );
    assert.deepEqual(
      input.items.map((i) => ({ ...i })),
      itemsCopy
    );
    assert.deepEqual(
      input.places.map((p) => ({ ...p })),
      placesCopy
    );
  });

  test("produces deterministic output for identical inputs", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day3 = makeDay({ id: "day_3", dayNumber: 3, date: "2026-12-03" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const items = [
      makeItem({ tripDayId: "day_3", id: "untimed", sortOrder: 0 }),
      makeItem({ tripDayId: "day_1", id: "midday", startTime: "12:00", sortOrder: 1 }),
      makeItem({ tripDayId: "day_1", id: "morning", startTime: "09:00", sortOrder: 0 }),
    ];
    const input: BuildTripPlanInput = {
      trip: makeTrip(),
      days: [day3, day1, day2],
      places: [makePlace()],
      items,
    };

    assert.deepEqual(buildTripPlan(input), buildTripPlan(input));
  });
});

describe("unassignedTripPlaces", () => {
  test("returns every place when nothing is scheduled", () => {
    const places = [
      makePlace({ placeId: "goa-palolem-beach", placeName: "Palolem Beach" }),
      makePlace({ id: "tp_2", placeId: "goa-market", placeName: "Goa Market" }),
    ];

    const result = unassignedTripPlaces(places, []);

    assert.deepEqual(
      result.map((p) => p.placeId),
      ["goa-palolem-beach", "goa-market"]
    );
  });

  test("excludes a place once it is scheduled on any day", () => {
    const places = [makePlace(), makePlace({ id: "tp_2", placeId: "goa-market" })];
    const items = [
      makeItem({ tripDayId: "day_1", id: "item_a" }),
      makeItem({ tripDayId: "day_1", id: "item_b", placeId: "goa-market", sortOrder: 1 }),
    ];

    const result = unassignedTripPlaces(places, items);

    assert.deepEqual(
      result.map((p) => p.placeId),
      []
    );
  });

  test("keeps a place scheduled on multiple days out of the unassigned set", () => {
    const places = [makePlace()];
    const items = [
      makeItem({ tripDayId: "day_1", id: "item_a" }),
      makeItem({ tripDayId: "day_2", id: "item_b" }),
    ];

    assert.deepEqual(unassignedTripPlaces(places, items), []);
  });

  test("only unassigned places are returned, preserving pool order", () => {
    const places = [
      makePlace({ id: "tp_1", placeId: "goa-palolem-beach" }),
      makePlace({ id: "tp_2", placeId: "goa-market" }),
      makePlace({ id: "tp_3", placeId: "goa-fort" }),
    ];
    const items = [makeItem({ tripDayId: "day_1", id: "item_a", placeId: "goa-market" })];

    const result = unassignedTripPlaces(places, items);

    assert.deepEqual(
      result.map((p) => p.placeId),
      ["goa-palolem-beach", "goa-fort"]
    );
  });
});