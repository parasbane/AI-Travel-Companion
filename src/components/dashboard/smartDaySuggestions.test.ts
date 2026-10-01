import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeSmartDaySuggestions } from "./smartDaySuggestions";
import type {
  SmartDaySuggestionsInput,
} from "./smartDaySuggestions";
import type { ItineraryItem, Trip, TripDay, TripPlace } from "@/lib/saved/types";

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

function makeDay(dayNumber: number, id = `day_${dayNumber}`): TripDay {
  return {
    id,
    tripId: "trip_1",
    userId: "user-a",
    dayNumber,
    date: "2026-12-01",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makePlace(placeId: string, placeName = `Place ${placeId}`): TripPlace {
  return {
    id: `tp_${placeId}`,
    tripId: "trip_1",
    userId: "user-a",
    placeId,
    placeName,
    destinationSlug: "goa",
    placeCategory: "relaxation",
    placeImageUrl: null,
    placeRating: 4.5,
    placePriceLevel: "budget",
    notes: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeItem(
  id: string,
  tripDayId: string,
  placeId: string,
  sortOrder = 0,
  placeName = `Place ${placeId}`
): ItineraryItem {
  return {
    id,
    tripId: "trip_1",
    tripDayId,
    userId: "user-a",
    placeId,
    placeName,
    placeCategory: "relaxation",
    placeImageUrl: null,
    startTime: "10:00",
    endTime: "11:00",
    notes: null,
    sortOrder,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("computeSmartDaySuggestions", () => {
  it("returns nothing for an empty trip", () => {
    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days: [],
      places: [],
      items: [],
    });

    assert.deepEqual(result.suggestions, []);
    assert.equal(result.summary.totalDays, 0);
    assert.equal(result.summary.plannedDays, 0);
    assert.equal(result.summary.emptyDays, 0);
    assert.equal(result.summary.unassignedPlaceCount, 0);
  });

  it("returns nothing when there are days but no places or items", () => {
    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days: [makeDay(1), makeDay(2)],
      places: [],
      items: [],
    });

    assert.deepEqual(result.suggestions, []);
    assert.equal(result.summary.totalDays, 2);
    assert.equal(result.summary.emptyDays, 2);
  });

  it("returns nothing when every place is already assigned, evenly", () => {
    const days = [makeDay(1), makeDay(2), makeDay(3)];
    const places = [makePlace("p1"), makePlace("p2"), makePlace("p3")];
    const items = [
      makeItem("i1", days[0].id, "p1"),
      makeItem("i2", days[1].id, "p2"),
      makeItem("i3", days[2].id, "p3"),
    ];

    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days,
      places,
      items,
    });

    assert.deepEqual(result.suggestions, []);
    assert.equal(result.summary.unassignedPlaceCount, 0);
    assert.equal(result.summary.plannedDays, 3);
  });

  it("suggests assigning unassigned places to the lightest day", () => {
    const days = [makeDay(1), makeDay(2)];
    const places = [makePlace("p1"), makePlace("p2"), makePlace("p3")];
    const items = [makeItem("i1", days[0].id, "p1")];

    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days,
      places,
      items,
    });

    assert.equal(result.summary.unassignedPlaceCount, 2);
    assert.equal(result.suggestions.length, 2);
    assert.deepEqual(
      result.suggestions.map((s) => s.kind),
      ["assign-unassigned", "assign-unassigned"]
    );
    assert.deepEqual(
      result.suggestions.map((s) => s.placeId),
      ["p2", "p3"]
    );
    for (const suggestion of result.suggestions) {
      assert.equal(suggestion.sourceDay, null);
      assert.equal(suggestion.action.type, "assign-place");
      assert.equal(suggestion.action.targetDayId, days[1].id);
      assert.equal(suggestion.targetDay?.dayNumber, 2);
      assert.match(suggestion.reason, /Day 2/);
      assert.ok(suggestion.reason.includes(suggestion.placeName));
      assert.ok(suggestion.action.itemId === undefined);
    }
  });

  it("targets the earliest day when several days are equally empty", () => {
    const days = [makeDay(1), makeDay(2)];
    const places = [makePlace("p1"), makePlace("p2")];

    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days,
      places,
      items: [],
    });

    assert.equal(result.summary.emptyDays, 2);
    assert.equal(result.summary.unassignedPlaceCount, 2);
    assert.deepEqual(
      result.suggestions.map((s) => s.targetDay?.dayNumber),
      [1, 1]
    );
    for (const suggestion of result.suggestions) {
      assert.equal(suggestion.action.targetDayId, days[0].id);
    }
  });

  it("suggests moving a stop from a heavy day to an empty day", () => {
    const days = [makeDay(1), makeDay(2), makeDay(3)];
    const places = [makePlace("p1"), makePlace("p2"), makePlace("p3")];
    const items = [
      makeItem("i1", days[0].id, "p1", 0),
      makeItem("i2", days[0].id, "p2", 1),
      makeItem("i3", days[0].id, "p3", 2),
    ];

    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days,
      places,
      items,
    });

    assert.equal(result.summary.unassignedPlaceCount, 0);
    assert.equal(result.suggestions.length, 1);
    const suggestion = result.suggestions[0];
    assert.equal(suggestion.kind, "rebalance");
    assert.equal(suggestion.placeId, "p1");
    assert.equal(suggestion.action.type, "move-item");
    assert.equal(suggestion.action.itemId, "i1");
    assert.equal(suggestion.sourceDay?.dayNumber, 1);
    assert.equal(suggestion.sourceDay?.id, days[0].id);
    assert.equal(suggestion.targetDay?.dayNumber, 2);
    assert.equal(suggestion.action.targetDayId, days[2 - 1].id);
    assert.match(suggestion.reason, /Day 1 has 3 stops while Day 2/);
  });

  it("skips a heavy day whose only candidates are already on the target day", () => {
    const days = [makeDay(1), makeDay(2), makeDay(3)];
    const places = [makePlace("p1"), makePlace("p2")];
    const items = [
      makeItem("i1", days[0].id, "p1", 0),
      makeItem("i2", days[0].id, "p1", 1),
      makeItem("i3", days[0].id, "p1", 2),
      makeItem("i4", days[1].id, "p1", 0),
      makeItem("i5", days[2].id, "p2", 0),
    ];

    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days,
      places,
      items,
    });

    assert.deepEqual(result.suggestions, []);
  });

  it("produces one move suggestion per heavy day, ordered by day", () => {
    const days = [makeDay(1), makeDay(2), makeDay(3)];
    const places = [makePlace("p1"), makePlace("p2"), makePlace("p3"), makePlace("p4"), makePlace("p5")];
    const items = [
      makeItem("i1", days[0].id, "p1", 0),
      makeItem("i2", days[0].id, "p2", 1),
      makeItem("i3", days[0].id, "p3", 2),
      makeItem("i4", days[2].id, "p4", 0),
      makeItem("i5", days[2].id, "p5", 1),
    ];

    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days,
      places,
      items,
    });

    assert.deepEqual(
      result.suggestions.map((s) => [s.kind, s.sourceDay?.dayNumber, s.targetDay?.dayNumber]),
      [
        ["rebalance", 1, 2],
        ["rebalance", 3, 2],
      ]
    );
    assert.equal(result.suggestions[0].action.itemId, "i1");
    assert.equal(result.suggestions[1].action.itemId, "i4");
  });

  it("mixes assign and rebalance suggestions without duplicates", () => {
    const days = [makeDay(1), makeDay(2), makeDay(3)];
    const places = [makePlace("p1"), makePlace("p2"), makePlace("p3"), makePlace("p4")];
    const items = [
      makeItem("i1", days[0].id, "p1", 0),
      makeItem("i2", days[0].id, "p2", 1),
    ];

    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days,
      places,
      items,
    });

    assert.ok(result.suggestions.some((s) => s.kind === "assign-unassigned"));
    assert.ok(result.suggestions.some((s) => s.kind === "rebalance"));

    const keys = result.suggestions.map(
      (s) => `${s.kind}:${s.placeId}:${s.action.targetDayId}`
    );
    assert.equal(new Set(keys).size, result.suggestions.length);
  });

  it("is deterministic for identical input", () => {
    const days = [makeDay(1), makeDay(2), makeDay(3)];
    const places = [makePlace("p1"), makePlace("p2"), makePlace("p3"), makePlace("p4")];
    const items = [
      makeItem("i1", days[0].id, "p1", 0),
      makeItem("i2", days[0].id, "p2", 1),
      makeItem("i3", days[2].id, "p3", 0),
    ];
    const input = { trip: makeTrip(), days, places, items };

    assert.deepEqual(
      computeSmartDaySuggestions(input),
      computeSmartDaySuggestions(input)
    );
  });

  it("handles missing and partial data safely", () => {
    const partial = {
      trip: makeTrip(),
      days: undefined as unknown as TripDay[],
      places: undefined as unknown as TripPlace[],
      items: undefined as unknown as ItineraryItem[],
    };

    const result = computeSmartDaySuggestions(partial as SmartDaySuggestionsInput);
    assert.deepEqual(result.suggestions, []);
    assert.equal(result.summary.totalDays, 0);
  });

  it("treats orphan items as assigned but never as day content", () => {
    const days = [makeDay(1), makeDay(2)];
    const places = [makePlace("p1"), makePlace("p2")];
    const items = [
      makeItem("i1", "unknown_day", "p1", 0),
      makeItem("i2", days[0].id, "p2", 0),
    ];

    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days,
      places,
      items,
    });

    assert.equal(result.summary.unassignedPlaceCount, 0);
    assert.equal(result.summary.plannedDays, 1);
    assert.equal(result.summary.emptyDays, 1);
    assert.deepEqual(result.suggestions, []);
  });

  it("de-duplicates the place pool by placeId", () => {
    const days = [makeDay(1), makeDay(2)];
    const places = [makePlace("p1"), makePlace("p1", "duplicate")];

    const result = computeSmartDaySuggestions({
      trip: makeTrip(),
      days,
      places,
      items: [],
    });

    assert.equal(result.summary.unassignedPlaceCount, 1);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].placeId, "p1");
  });
});