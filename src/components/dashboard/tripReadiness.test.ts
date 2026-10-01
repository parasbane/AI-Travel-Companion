import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TRIP_READINESS_STATUS_LABEL,
  computeTripReadiness,
} from "./tripReadiness";
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

function makeDay(overrides: Partial<TripDay> & { id: string }): TripDay {
  const { id, ...rest } = overrides;
  return {
    id,
    tripId: "trip_1",
    userId: "user-a",
    dayNumber: 1,
    date: "2026-12-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...rest,
  };
}

function makePlace(overrides: Partial<TripPlace> & { placeId: string; placeName: string }): TripPlace {
  const { placeId, placeName, ...rest } = overrides;
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
    ...rest,
  };
}

function makeItem(
  overrides: Partial<ItineraryItem> & { id: string; tripDayId: string; placeId: string }
): ItineraryItem {
  const { id, tripDayId, placeId, ...rest } = overrides;
  return {
    id,
    tripId: "trip_1",
    tripDayId,
    userId: "user-a",
    placeId,
    placeName: "Place",
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

function daysOf(range: [number, number]): TripDay[] {
  const days: TripDay[] = [];
  for (let dayNumber = range[0]; dayNumber <= range[1]; dayNumber++) {
    days.push(makeDay({ id: `day_${dayNumber}`, dayNumber }));
  }
  return days;
}

describe("status labels", () => {
  it("maps every status to a friendly label", () => {
    assert.deepEqual(Object.keys(TRIP_READINESS_STATUS_LABEL), [
      "getting-started",
      "in-progress",
      "almost-ready",
      "ready",
    ]);
    assert.equal(TRIP_READINESS_STATUS_LABEL.ready, "Ready");
    assert.equal(TRIP_READINESS_STATUS_LABEL["getting-started"], "Getting started");
  });
});

describe("computeTripReadiness", () => {
  it("reports an empty/new trip as getting started", () => {
    const summary = computeTripReadiness({
      trip: makeTrip({ startDate: null, endDate: null }),
      days: [],
      places: [],
      items: [],
    });

    assert.equal(summary.status, "getting-started");
    assert.equal(summary.statusLabel, "Getting started");
    assert.equal(summary.score, 0);
    assert.equal(summary.totalDays, 0);
    assert.equal(summary.plannedDays, 0);
    assert.equal(summary.emptyDays, 0);
    assert.equal(summary.placesAdded, 0);
    assert.equal(summary.assignedPlaceCount, 0);
    assert.equal(summary.unassignedPlaceCount, 0);
    assert.equal(summary.itineraryItemCount, 0);
    assert.deepEqual(summary.conciseSummary, "0 of 0 days planned");
    assert.deepEqual(
      summary.checklist.map((item) => item.label),
      [
        "Set this trip's start and end dates",
        "Add places to this trip",
      ]
    );
    assert.ok(summary.checklist.every((item) => item.kind === "todo"));
  });

  it("reports a trip with no dates as getting started even with planning data", () => {
    const summary = computeTripReadiness({
      trip: makeTrip({ startDate: null, endDate: null }),
      days: daysOf([1, 2]),
      places: [makePlace({ placeId: "p1", placeName: "Place 1" })],
      items: [
        makeItem({ id: "i1", tripDayId: "day_1", placeId: "p1", startTime: "10:00", endTime: "11:00" }),
      ],
    });

    assert.equal(summary.status, "getting-started");
    assert.equal(summary.score, 24);
    assert.ok(
      summary.checklist.some(
        (item) => item.kind === "todo" && item.label === "Set this trip's start and end dates"
      )
    );
  });

  it("reports a trip with places but no itinerary as in progress", () => {
    const summary = computeTripReadiness({
      trip: makeTrip(),
      days: daysOf([1, 3]),
      places: [
        makePlace({ placeId: "p1", placeName: "Place 1" }),
        makePlace({ placeId: "p2", placeName: "Place 2" }),
        makePlace({ placeId: "p3", placeName: "Place 3" }),
      ],
      items: [],
    });

    assert.equal(summary.status, "in-progress");
    assert.equal(summary.score, 45);
    assert.equal(summary.plannedDays, 0);
    assert.equal(summary.emptyDays, 3);
    assert.equal(summary.unassignedPlaceCount, 3);
    assert.deepEqual(
      summary.checklist.filter((item) => item.kind === "done").map((item) => item.label),
      [
        "Trip dates are set",
        "3 places added",
      ]
    );
    assert.deepEqual(
      summary.checklist.filter((item) => item.kind === "todo").map((item) => item.label),
      [
        "3 days still need activities",
        "3 places are still unassigned",
      ]
    );
    assert.equal(summary.conciseSummary, "0 of 3 days planned · 0 of 3 places assigned");
  });

  it("reports a partially planned trip as in progress", () => {
    const summary = computeTripReadiness({
      trip: makeTrip(),
      days: daysOf([1, 4]),
      places: [
        makePlace({ placeId: "p1", placeName: "Place 1" }),
        makePlace({ placeId: "p2", placeName: "Place 2" }),
        makePlace({ placeId: "p3", placeName: "Place 3" }),
      ],
      items: [makeItem({ id: "i1", tripDayId: "day_1", placeId: "p1" })],
    });

    assert.equal(summary.status, "in-progress");
    assert.equal(summary.score, 58);
    assert.equal(summary.plannedDays, 1);
    assert.equal(summary.emptyDays, 3);
    assert.equal(summary.assignedPlaceCount, 1);
    assert.equal(summary.unassignedPlaceCount, 2);
    assert.equal(summary.untimedItemCount, 1);
    assert.deepEqual(
      summary.checklist.filter((item) => item.kind === "todo").map((item) => item.label),
      [
        "3 days still need activities",
        "2 places are still unassigned",
        "1 stop is missing a time",
      ]
    );
  });

  it("reports a mostly planned trip as almost ready", () => {
    const places = [
      makePlace({ placeId: "p1", placeName: "Place 1" }),
      makePlace({ placeId: "p2", placeName: "Place 2" }),
      makePlace({ placeId: "p3", placeName: "Place 3" }),
      makePlace({ placeId: "p4", placeName: "Place 4" }),
      makePlace({ placeId: "p5", placeName: "Place 5" }),
      makePlace({ placeId: "p6", placeName: "Place 6" }),
    ];
    const summary = computeTripReadiness({
      trip: makeTrip({ endDate: "2026-12-05" }),
      days: daysOf([1, 5]),
      places,
      items: [
        makeItem({ id: "i1", tripDayId: "day_1", placeId: "p1", startTime: "10:00", endTime: "11:00" }),
        makeItem({ id: "i2", tripDayId: "day_2", placeId: "p2", startTime: "09:00", endTime: "10:00" }),
        makeItem({ id: "i3", tripDayId: "day_3", placeId: "p3" }),
        makeItem({ id: "i4", tripDayId: "day_4", placeId: "p1" }),
        makeItem({ id: "i5", tripDayId: "day_5", placeId: "p2" }),
      ],
    });

    assert.equal(summary.status, "almost-ready");
    assert.ok(summary.score >= 60 && summary.score < 90);
    assert.equal(summary.score, 87);
    assert.equal(summary.plannedDays, 5);
    assert.equal(summary.emptyDays, 0);
    assert.equal(summary.assignedPlaceCount, 3);
    assert.equal(summary.unassignedPlaceCount, 3);
    assert.equal(summary.untimedItemCount, 3);
  });

  it("reports a fully prepared trip as ready", () => {
    const summary = computeTripReadiness({
      trip: makeTrip(),
      days: daysOf([1, 3]),
      places: [
        makePlace({ placeId: "p1", placeName: "Place 1" }),
        makePlace({ placeId: "p2", placeName: "Place 2" }),
        makePlace({ placeId: "p3", placeName: "Place 3" }),
      ],
      items: [
        makeItem({ id: "i1", tripDayId: "day_1", placeId: "p1", startTime: "10:00", endTime: "11:00" }),
        makeItem({ id: "i2", tripDayId: "day_2", placeId: "p2", startTime: "09:00", endTime: "10:00" }),
        makeItem({ id: "i3", tripDayId: "day_3", placeId: "p3", startTime: "14:00", endTime: "15:00" }),
      ],
    });

    assert.equal(summary.status, "ready");
    assert.equal(summary.statusLabel, "Ready");
    assert.equal(summary.score, 100);
    assert.equal(summary.totalDays, 3);
    assert.equal(summary.plannedDays, 3);
    assert.equal(summary.emptyDays, 0);
    assert.equal(summary.unassignedPlaceCount, 0);
    assert.equal(summary.untimedItemCount, 0);
    assert.equal(summary.checklist.filter((item) => item.kind === "todo").length, 0);
    assert.deepEqual(
      summary.checklist.map((item) => item.label),
      [
        "Trip dates are set",
        "3 places added",
        "Every day has an activity",
        "Every place is assigned to a day",
        "Every stop has a time set",
      ]
    );
    assert.equal(summary.conciseSummary, "3 of 3 days planned · 3 of 3 places assigned");
  });

  it("counts orphan items and de-duplicates the place pool", () => {
    const summary = computeTripReadiness({
      trip: makeTrip(),
      days: daysOf([1, 1]),
      places: [
        makePlace({ placeId: "p1", placeName: "Place 1" }),
        makePlace({ placeId: "p2", placeName: "Place 2" }),
        makePlace({ placeId: "p1", placeName: "Place 1 dup" }),
      ],
      items: [
        makeItem({ id: "i1", tripDayId: "day_1", placeId: "p1", startTime: "10:00", endTime: "11:00" }),
        makeItem({ id: "i2", tripDayId: "day_1", placeId: "orphan-x", startTime: "12:00", endTime: "13:00" }),
      ],
    });

    assert.equal(summary.placesAdded, 3);
    assert.equal(summary.assignedPlaceCount, 2);
    assert.equal(summary.unassignedPlaceCount, 1);
    assert.equal(summary.itineraryItemCount, 2);
    assert.equal(summary.timedItemCount, 2);
    assert.equal(summary.untimedItemCount, 0);
  });

  it("clamps the assignment ratio and produces deterministic output", () => {
    const input = {
      trip: makeTrip(),
      days: daysOf([1, 2]),
      places: [makePlace({ placeId: "p1", placeName: "Place 1" })],
      items: [
        makeItem({ id: "i1", tripDayId: "day_1", placeId: "p1", startTime: "10:00", endTime: "11:00" }),
        makeItem({ id: "i2", tripDayId: "day_2", placeId: "orphan-x", startTime: "12:00", endTime: "13:00" }),
      ],
    };

    const first = computeTripReadiness(input);
    const second = computeTripReadiness(input);
    assert.deepEqual(first, second);
    assert.equal(first.plannedDays, 2);
    assert.equal(first.assignedPlaceCount, 2);
    assert.equal(first.unassignedPlaceCount, 0);
    assert.equal(first.untimedItemCount, 0);
  });
});