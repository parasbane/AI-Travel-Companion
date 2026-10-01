import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatTripDate,
  formatTripDateRange,
  tripDurationDays,
  buildTripDates,
  reconcileTripDates,
  formatTimeRange,
} from "./tripDates";
import type { Trip } from "./types";

let nextId = 1;

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: `trip_${nextId++}`,
    userId: "user-a",
    title: "Goa Getaway",
    destinationSlug: "goa",
    destinationName: "Goa",
    description: null,
    startDate: "2026-03-03",
    endDate: "2026-03-08",
    status: "planning",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatTripDate", () => {
  test("formats an ISO date", () => {
    assert.equal(formatTripDate("2026-03-03"), "Mar 3, 2026");
  });

  test("returns an empty string for missing or invalid values", () => {
    assert.equal(formatTripDate(null), "");
    assert.equal(formatTripDate(undefined), "");
    assert.equal(formatTripDate(""), "");
    assert.equal(formatTripDate("not-a-date"), "");
  });
});

describe("formatTripDateRange", () => {
  test("renders a full range when both dates exist", () => {
    assert.equal(formatTripDateRange(makeTrip()), "Mar 3, 2026 – Mar 8, 2026");
  });

  test("handles a trip with only a start date", () => {
    assert.equal(
      formatTripDateRange(makeTrip({ endDate: null })),
      "Mar 3, 2026 onwards"
    );
  });

  test("falls back when no dates are set", () => {
    assert.equal(
      formatTripDateRange(makeTrip({ startDate: null, endDate: null })),
      "Dates not set yet"
    );
  });
});

describe("tripDurationDays", () => {
  test("counts inclusive days", () => {
    assert.equal(tripDurationDays(makeTrip()), 6);
  });

  test("returns 1 for a single-day trip", () => {
    assert.equal(
      tripDurationDays(makeTrip({ startDate: "2026-03-03", endDate: "2026-03-03" })),
      1
    );
  });

  test("returns null for missing or invalid dates", () => {
    assert.equal(tripDurationDays(makeTrip({ startDate: null })), null);
    assert.equal(tripDurationDays(makeTrip({ endDate: null })), null);
    assert.equal(
      tripDurationDays(makeTrip({ startDate: "2026-03-10", endDate: "2026-03-03" })),
      null
    );
  });
});

describe("buildTripDates", () => {
  test("expands a range into one ISO date per day", () => {
    assert.deepEqual(buildTripDates("2026-03-03", "2026-03-08"), [
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
    ]);
  });

  test("returns a single date for a single-day range", () => {
    assert.deepEqual(buildTripDates("2026-12-01", "2026-12-01"), [
      "2026-12-01",
    ]);
  });

  test("returns null for missing or invalid ranges", () => {
    assert.equal(buildTripDates(null, "2026-03-08"), null);
    assert.equal(buildTripDates("2026-03-03", null), null);
    assert.equal(buildTripDates("2026-03-10", "2026-03-03"), null);
    assert.equal(buildTripDates("not-a-date", "2026-03-03"), null);
  });
});

describe("reconcileTripDates", () => {
  test("detects missing days and out-of-range days", () => {
    assert.deepEqual(
      reconcileTripDates("2026-12-01", "2026-12-05", [
        "2026-12-03",
        "2026-12-04",
        "2026-12-10",
      ]),
      {
        missing: ["2026-12-01", "2026-12-02", "2026-12-05"],
        outOfRange: ["2026-12-10"],
      }
    );
  });

  test("reports an empty plan when existing days already match the range", () => {
    assert.deepEqual(
      reconcileTripDates("2026-12-01", "2026-12-03", [
        "2026-12-01",
        "2026-12-02",
        "2026-12-03",
      ]),
      { missing: [], outOfRange: [] }
    );
  });

  test("returns null for invalid or missing ranges", () => {
    assert.equal(reconcileTripDates(null, "2026-12-03", []), null);
    assert.equal(reconcileTripDates("2026-12-03", null, []), null);
    assert.equal(reconcileTripDates("2026-12-05", "2026-12-03", []), null);
    assert.equal(reconcileTripDates("not-a-date", "2026-12-03", []), null);
  });

  test("ignores days without a usable date", () => {
    assert.deepEqual(
      reconcileTripDates("2026-12-01", "2026-12-01", [null, undefined, ""]),
      { missing: ["2026-12-01"], outOfRange: [] }
    );
  });

  test("keeps missing days in range order and out-of-range in given order", () => {
    assert.deepEqual(
      reconcileTripDates("2026-12-01", "2026-12-02", [
        "2026-12-08",
        "2026-12-01",
      ]),
      { missing: ["2026-12-02"], outOfRange: ["2026-12-08"] }
    );
  });
});

describe("formatTimeRange", () => {
  test("renders a full range in 12-hour form", () => {
    assert.equal(formatTimeRange("10:00", "12:00"), "10:00 AM – 12:00 PM");
  });

  test("maps midnight, noon, and afternoon hours correctly", () => {
    assert.equal(formatTimeRange("00:00", "00:30"), "12:00 AM – 12:30 AM");
    assert.equal(formatTimeRange("09:00", "12:00"), "9:00 AM – 12:00 PM");
    assert.equal(formatTimeRange("13:05", "17:45"), "1:05 PM – 5:45 PM");
  });

  test("renders a single bound when only one is set", () => {
    assert.equal(formatTimeRange("09:00", null), "9:00 AM");
    assert.equal(formatTimeRange(null, "18:00"), "until 6:00 PM");
  });

  test("returns null when no time is set", () => {
    assert.equal(formatTimeRange(null, null), null);
    assert.equal(formatTimeRange(undefined, undefined), null);
  });

  test("returns null for invalid input", () => {
    assert.equal(formatTimeRange("not-a-time", "12:00"), null);
  });
});
