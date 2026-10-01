import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { orderItineraryItems } from "./itineraryOrder";
import type { ItineraryItem } from "./types";

function item(overrides: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: "item",
    tripId: "trip",
    tripDayId: "day",
    userId: "user",
    placeId: "place",
    placeName: "Place",
    placeCategory: "food",
    placeImageUrl: null,
    startTime: null,
    endTime: null,
    notes: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("orderItineraryItems", () => {
  test("sorts timed stops chronologically", () => {
    const items = [
      item({ id: "afternoon", startTime: "14:00", sortOrder: 0 }),
      item({ id: "evening", startTime: "19:00", sortOrder: 1 }),
      item({ id: "morning", startTime: "10:00", sortOrder: 2 }),
    ];

    assert.deepEqual(
      orderItineraryItems(items).map((i) => i.id),
      ["morning", "afternoon", "evening"]
    );
  });

  test("keeps untimed stops visible after timed stops", () => {
    const items = [
      item({ id: "untimed-b", sortOrder: 1 }),
      item({ id: "timed", startTime: "08:00", sortOrder: 0 }),
      item({ id: "untimed-a", sortOrder: 0 }),
    ];

    assert.deepEqual(
      orderItineraryItems(items).map((i) => i.id),
      ["timed", "untimed-a", "untimed-b"]
    );
  });

  test("orders stops that share a time deterministically by existing order", () => {
    const items = [
      item({ id: "first", startTime: "10:00", sortOrder: 0, createdAt: "2026-01-01T00:00:00.000Z" }),
      item({ id: "second", startTime: "10:00", sortOrder: 1, createdAt: "2026-01-01T00:00:01.000Z" }),
    ];

    assert.deepEqual(
      orderItineraryItems(items).map((i) => i.id),
      ["first", "second"]
    );
  });

  test("keeps the existing order when no stops are timed", () => {
    const items = [
      item({ id: "a", sortOrder: 1 }),
      item({ id: "b", sortOrder: 0 }),
    ];

    assert.deepEqual(
      orderItineraryItems(items).map((i) => i.id),
      ["b", "a"]
    );
  });

  test("returns an empty list for no stops", () => {
    assert.deepEqual(orderItineraryItems([]), []);
  });

  test("does not mutate the input array", () => {
    const items = [
      item({ id: "b", startTime: "14:00", sortOrder: 1 }),
      item({ id: "a", startTime: "09:00", sortOrder: 0 }),
    ];
    const copy = items.slice();

    orderItineraryItems(items);

    assert.deepEqual(items, copy);
  });
});