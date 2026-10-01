import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { analyzeTripPlan } from "./tripPlanReport";
import { buildTripPlan, type BuildTripPlanInput } from "./tripPlan";
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

describe("analyzeTripPlan", () => {
  test("returns a clean report for an empty trip", () => {
    const result = analyzeTripPlan(plan());

    assert.equal(result.tripId, "trip_1");
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.summary, {
      totalDays: 0,
      plannedDays: 0,
      emptyDays: 0,
      totalItems: 0,
      unassignedPlaceCount: 0,
      issueCount: 0,
    });
  });

  test("flags an inverted time range as an error", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const item = makeItem({
      tripDayId: "day_1",
      id: "item_inv",
      placeId: "goa-night",
      placeName: "Night Market",
      startTime: "14:00",
      endTime: "09:00",
    });

    const result = analyzeTripPlan(plan({ days: [day1], items: [item] }));

    assert.equal(result.issues.length, 1);
    const issue = result.issues[0];
    assert.equal(issue.code, "inverted-time-range");
    assert.equal(issue.severity, "error");
    assert.equal(issue.itemId, "item_inv");
    assert.equal(issue.placeId, "goa-night");
    assert.equal(issue.dayNumber, 1);
    assert.match(issue.message, /Night Market/);
  });

  test("flags days outside the trip's date range as errors", () => {
    const before = makeDay({ id: "day_0", dayNumber: 0, date: "2026-11-28" });
    const after = makeDay({ id: "day_4", dayNumber: 4, date: "2026-12-08" });

    const result = analyzeTripPlan(plan({ days: [before, after] }));

    const outside = result.issues.filter((i) => i.code === "day-outside-trip");
    assert.equal(outside.length, 2);
    assert.ok(outside.every((i) => i.severity === "error"));
    assert.equal(outside[0].dayNumber, 0);
    assert.equal(outside[1].dayNumber, 4);
    assert.match(outside[0].message, /2026-11-28/);
    assert.match(outside[1].message, /2026-12-08/);
  });

  test("does not flag days inside the trip's date range", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day3 = makeDay({ id: "day_3", dayNumber: 3, date: "2026-12-03" });

    const result = analyzeTripPlan(plan({ days: [day1, day3] }));

    assert.ok(
      result.issues.every((i) => i.code !== "day-outside-trip")
    );
  });

  test("flags the same place scheduled across two days as an advisory warning", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day3 = makeDay({ id: "day_3", dayNumber: 3, date: "2026-12-03" });
    const items = [
      makeItem({ tripDayId: "day_1", id: "item_a" }),
      makeItem({ tripDayId: "day_3", id: "item_b" }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1, day3], items }));

    const issue = result.issues.find((i) => i.code === "duplicate-place-cross-day");
    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.placeId, "goa-palolem-beach");
    assert.equal(issue.dayNumber, 1);
    assert.match(issue.message, /2 different days/);
    assert.match(issue.message, /Day 1/);
    assert.match(issue.message, /Day 3/);
  });

  test("does not flag a place repeated within a single day", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const items = [
      makeItem({ tripDayId: "day_1", id: "item_a" }),
      makeItem({ tripDayId: "day_1", id: "item_b", sortOrder: 1 }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1], items }));

    assert.ok(
      result.issues.every((i) => i.code !== "duplicate-place-cross-day")
    );
  });

  test("flags overlapping time windows within a day as a warning", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const items = [
      makeItem({
        tripDayId: "day_1",
        id: "beach",
        placeId: "goa-beach",
        placeName: "Beach",
        startTime: "10:00",
        endTime: "12:00",
        sortOrder: 0,
      }),
      makeItem({
        tripDayId: "day_1",
        id: "market",
        placeId: "goa-market",
        placeName: "Market",
        startTime: "11:00",
        endTime: "13:00",
        sortOrder: 1,
      }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1], items }));

    const issue = result.issues.find((i) => i.code === "overlapping-times");
    assert.ok(issue);
    assert.equal(issue.severity, "warning");
    assert.equal(issue.dayNumber, 1);
    assert.equal(issue.itemId, "beach");
    assert.match(issue.message, /Beach and Market overlap on Day 1/);
  });

  test("flags overlapping windows with equal start times", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const items = [
      makeItem({
        tripDayId: "day_1",
        id: "a",
        placeName: "Alpha",
        startTime: "10:00",
        endTime: "12:00",
        sortOrder: 0,
      }),
      makeItem({
        tripDayId: "day_1",
        id: "b",
        placeName: "Beta",
        startTime: "10:00",
        endTime: "10:30",
        sortOrder: 1,
      }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1], items }));

    assert.ok(result.issues.some((i) => i.code === "overlapping-times"));
  });

  test("does not flag back-to-back windows as overlapping", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const items = [
      makeItem({
        tripDayId: "day_1",
        id: "a",
        placeName: "Alpha",
        startTime: "10:00",
        endTime: "12:00",
        sortOrder: 0,
      }),
      makeItem({
        tripDayId: "day_1",
        id: "b",
        placeName: "Beta",
        startTime: "12:00",
        endTime: "14:00",
        sortOrder: 1,
      }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1], items }));

    assert.ok(
      result.issues.every((i) => i.code !== "overlapping-times")
    );
  });

  test("ignores overlap checks unless both items have valid start and end times", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const items = [
      makeItem({
        tripDayId: "day_1",
        id: "a",
        placeName: "Alpha",
        startTime: "10:00",
        endTime: "12:00",
        sortOrder: 0,
      }),
      // Only a start time — must not participate in overlap checks.
      makeItem({
        tripDayId: "day_1",
        id: "b",
        placeName: "Beta",
        startTime: "11:00",
        sortOrder: 1,
      }),
      // Non-HH:MM format — must not participate in overlap checks.
      makeItem({
        tripDayId: "day_1",
        id: "c",
        placeName: "Gamma",
        startTime: "9:00",
        endTime: "13:00",
        sortOrder: 2,
      }),
      // Untimed — must not participate in overlap checks.
      makeItem({ tripDayId: "day_1", id: "d", placeName: "Delta", sortOrder: 3 }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1], items }));

    assert.ok(
      result.issues.every((i) => i.code !== "overlapping-times")
    );
  });

  test("emits a deterministic overlapping-times issue for each overlapping consecutive pair", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const items = [
      makeItem({
        tripDayId: "day_1",
        id: "wide",
        placeName: "Wide",
        startTime: "10:00",
        endTime: "13:00",
        sortOrder: 0,
      }),
      makeItem({
        tripDayId: "day_1",
        id: "narrow",
        placeName: "Narrow",
        startTime: "11:00",
        endTime: "12:00",
        sortOrder: 1,
      }),
      makeItem({
        tripDayId: "day_1",
        id: "late",
        placeName: "Late",
        startTime: "11:30",
        endTime: "14:00",
        sortOrder: 2,
      }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1], items }));

    const overlaps = result.issues.filter((i) => i.code === "overlapping-times");
    assert.equal(overlaps.length, 2);
    // Globally sorted by (severity, code, day, ref id), so both pairs appear
    // with their primary item ids ordered lexicographically: narrow, then wide.
    assert.equal(overlaps[0].itemId, "narrow");
    assert.equal(overlaps[1].itemId, "wide");
  });

  test("flags empty days as info issues", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const items = [makeItem({ tripDayId: "day_1", id: "item_a" })];

    const result = analyzeTripPlan(plan({ days: [day1, day2], items }));

    const issue = result.issues.find((i) => i.code === "empty-day");
    assert.ok(issue);
    assert.equal(issue.severity, "info");
    assert.equal(issue.dayNumber, 2);
    assert.match(issue.message, /Day 2 has no activities planned yet/);
  });

  test("flags trip places never added to any day as info issues", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const items = [makeItem({ tripDayId: "day_1", id: "item_a" })];
    const places = [
      makePlace({ placeId: "goa-palolem-beach", placeName: "Palolem Beach" }),
      makePlace({ placeId: "goa-fort", placeName: "Fort Aguada" }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1], items, places }));

    const unassigned = result.issues.filter((i) => i.code === "unassigned-place");
    assert.equal(unassigned.length, 1);
    assert.equal(unassigned[0].severity, "info");
    assert.equal(unassigned[0].placeId, "goa-fort");
    assert.match(unassigned[0].message, /Fort Aguada has not been added to any day yet/);
  });

  test("emits a single unassigned-place issue when the pool lists a place twice", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const places = [
      makePlace({ id: "tp_a", placeId: "goa-fort", placeName: "Fort Aguada" }),
      makePlace({ id: "tp_b", placeId: "goa-fort", placeName: "Fort Aguada" }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1], items: [], places }));

    const unassigned = result.issues.filter((i) => i.code === "unassigned-place");
    assert.equal(unassigned.length, 1);
  });

  test("summarizes counts across days, items, and unassigned places", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const day3 = makeDay({ id: "day_3", dayNumber: 3, date: "2026-12-03" });
    const items = [
      makeItem({ tripDayId: "day_1", id: "a" }),
      makeItem({ tripDayId: "day_1", id: "b" }),
      makeItem({
        tripDayId: "day_2",
        id: "c",
        placeId: "goa-market",
        placeName: "Goa Market",
      }),
    ];
    const places = [
      makePlace({ placeId: "goa-palolem-beach", placeName: "Palolem Beach" }),
      makePlace({ id: "tp_2", placeId: "goa-fort", placeName: "Fort Aguada" }),
      makePlace({ id: "tp_3", placeId: "goa-market", placeName: "Goa Market" }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1, day2, day3], items, places }));

    assert.deepEqual(result.summary, {
      totalDays: 3,
      plannedDays: 2,
      emptyDays: 1,
      totalItems: 3,
      unassignedPlaceCount: 1,
      issueCount: 2,
    });
  });

  test("orders issues deterministically: errors, then warnings, then info", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const day3 = makeDay({ id: "day_3", dayNumber: 3, date: "2026-12-03" });
    const items = [
      makeItem({
        tripDayId: "day_1",
        id: "item_a",
        placeId: "goa-beach",
        placeName: "Beach",
        startTime: "10:00",
        endTime: "12:00",
        sortOrder: 0,
      }),
      makeItem({
        tripDayId: "day_1",
        id: "item_b",
        placeId: "goa-market",
        placeName: "Market",
        startTime: "11:00",
        endTime: "13:00",
        sortOrder: 1,
      }),
      makeItem({
        tripDayId: "day_1",
        id: "item_c",
        placeId: "goa-night",
        placeName: "Night Market",
        startTime: "14:00",
        endTime: "09:00",
        sortOrder: 2,
      }),
      makeItem({ tripDayId: "day_3", id: "item_d", placeId: "goa-beach", placeName: "Beach" }),
    ];
    const places = [
      makePlace({ placeId: "goa-beach", placeName: "Beach" }),
      makePlace({ id: "tp_2", placeId: "goa-market", placeName: "Market" }),
      makePlace({ id: "tp_3", placeId: "goa-night", placeName: "Night Market" }),
      makePlace({ id: "tp_4", placeId: "goa-fort", placeName: "Fort Aguada" }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1, day2, day3], items, places }));

    assert.deepEqual(
      result.issues.map((i) => i.code),
      [
        "inverted-time-range",
        "duplicate-place-cross-day",
        "overlapping-times",
        "empty-day",
        "unassigned-place",
      ]
    );
    assert.deepEqual(
      result.issues.map((i) => i.severity),
      ["error", "warning", "warning", "info", "info"]
    );
    assert.deepEqual(result.summary, {
      totalDays: 3,
      plannedDays: 2,
      emptyDays: 1,
      totalItems: 4,
      unassignedPlaceCount: 1,
      issueCount: 5,
    });
  });

  test("tolerates a scheduled item whose place is not in the trip pool", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const items = [
      // Orphan: references a place id that no longer exists in the pool.
      makeItem({
        tripDayId: "day_1",
        id: "item_orphan",
        placeId: "goa-removed",
        placeName: "Removed Stop",
      }),
    ];
    const places = [
      makePlace({ placeId: "goa-palolem-beach", placeName: "Palolem Beach" }),
      makePlace({ id: "tp_2", placeId: "goa-market", placeName: "Goa Market" }),
    ];

    const result = analyzeTripPlan(plan({ days: [day1, day2], items, places }));

    // The report stays consistent: the orphan counts as an item but never
    // surfaces as an unassigned place because it is not in the pool.
    assert.equal(result.summary.totalItems, 1);
    assert.equal(result.summary.unassignedPlaceCount, 2);
    const unassigned = result.issues.filter((i) => i.code === "unassigned-place");
    assert.deepEqual(
      unassigned.map((i) => i.placeId).sort(),
      ["goa-palolem-beach", "goa-market"].sort()
    );
    assert.ok(result.issues.every((i) => i.code !== "day-outside-trip"));
    // Empty days and the intact pool entries are still surfaced.
    assert.ok(
      result.issues.some((i) => i.code === "empty-day" && i.dayNumber === 2)
    );
  });

  test("produces deterministic output for identical inputs", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const items = [
      makeItem({
        tripDayId: "day_1",
        id: "a",
        placeName: "Beach",
        startTime: "10:00",
        endTime: "12:00",
      }),
      makeItem({ tripDayId: "day_2", id: "b", placeName: "Beach" }),
    ];
    const input: BuildTripPlanInput = {
      trip: makeTrip(),
      days: [day2, day1],
      places: [],
      items,
    };

    assert.deepEqual(
      analyzeTripPlan(buildTripPlan(input)),
      analyzeTripPlan(buildTripPlan(input))
    );
  });

  test("does not mutate the trip plan or its nested objects", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const items = [
      makeItem({
        tripDayId: "day_1",
        id: "a",
        placeName: "Beach",
        startTime: "10:00",
        endTime: "12:00",
      }),
      makeItem({
        tripDayId: "day_1",
        id: "b",
        placeName: "Market",
        startTime: "11:00",
        endTime: "13:00",
      }),
      makeItem({ tripDayId: "day_2", id: "c", placeName: "Beach" }),
    ];
    const places = [
      makePlace({ placeId: "goa-palolem-beach", placeName: "Palolem Beach" }),
      makePlace({ id: "tp_2", placeId: "goa-fort", placeName: "Fort Aguada" }),
    ];
    const tripPlan = plan({ days: [day1, day2], items, places });
    const snapshot = JSON.parse(JSON.stringify(tripPlan)) as unknown;

    analyzeTripPlan(tripPlan);

    assert.deepEqual(tripPlan, snapshot);
  });
});