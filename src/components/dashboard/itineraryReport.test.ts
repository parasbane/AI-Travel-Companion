import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEVERITY_ORDER,
  SEVERITY_META,
  countIssuesBySeverity,
  formatIssueDay,
  groupIssuesBySeverity,
  resolveIssuePlaceName,
} from "./itineraryReport";
import type { ItineraryItem, TripPlanIssue } from "@/lib/saved/types";

function issue(overrides: Partial<TripPlanIssue> = {}): TripPlanIssue {
  return {
    code: "empty-day",
    severity: "info",
    message: "Day 2 has no activities planned yet.",
    ...overrides,
  };
}

function item(overrides: Partial<ItineraryItem> & { id: string }): ItineraryItem {
  const { id, ...rest } = overrides;
  return {
    id,
    tripId: "trip_1",
    tripDayId: "day_1",
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

describe("SEVERITY_ORDER", () => {
  it("orders severities error, then warning, then info", () => {
    assert.deepEqual(SEVERITY_ORDER, ["error", "warning", "info"]);
  });
});

describe("SEVERITY_META", () => {
  it("provides a label and description for every severity in order", () => {
    assert.deepEqual(
      SEVERITY_ORDER.map((severity) => SEVERITY_META[severity].label),
      ["Error", "Warning", "Info"]
    );
    for (const severity of SEVERITY_ORDER) {
      assert.ok(SEVERITY_META[severity].description.length > 0);
    }
  });
});

describe("countIssuesBySeverity", () => {
  it("counts errors, warnings, and info separately", () => {
    const issues = [
      issue({ severity: "error", code: "inverted-time-range" }),
      issue({ severity: "error", code: "day-outside-trip" }),
      issue({ severity: "warning", code: "overlapping-times" }),
      issue({ severity: "warning", code: "duplicate-place-cross-day" }),
      issue({ severity: "info", code: "empty-day" }),
      issue({ severity: "info", code: "unassigned-place" }),
    ];

    assert.deepEqual(countIssuesBySeverity(issues), {
      errors: 2,
      warnings: 2,
      info: 2,
      total: 6,
    });
  });

  it("returns zeroed counts for an empty report", () => {
    assert.deepEqual(countIssuesBySeverity([]), {
      errors: 0,
      warnings: 0,
      info: 0,
      total: 0,
    });
  });

  it("handles issues of only one severity", () => {
    const issues = [
      issue({ severity: "info" }),
      issue({ severity: "info" }),
    ];

    assert.deepEqual(countIssuesBySeverity(issues), {
      errors: 0,
      warnings: 0,
      info: 2,
      total: 2,
    });
  });
});

describe("groupIssuesBySeverity", () => {
  it("groups issues by severity in fixed order, skipping empty groups", () => {
    const issues = [
      issue({ severity: "info", message: "i1" }),
      issue({ severity: "error", message: "e1" }),
      issue({ severity: "info", message: "i2" }),
      issue({ severity: "error", message: "e2" }),
    ];

    const groups = groupIssuesBySeverity(issues);

    assert.deepEqual(
      groups.map((group) => group.severity),
      ["error", "info"]
    );
    assert.deepEqual(
      groups[0].issues.map((item) => item.message),
      ["e1", "e2"]
    );
    assert.deepEqual(
      groups[1].issues.map((item) => item.message),
      ["i1", "i2"]
    );
  });

  it("preserves issue order within each severity group", () => {
    const issues = [
      issue({ severity: "warning", message: "w1" }),
      issue({ severity: "error", message: "e1" }),
      issue({ severity: "warning", message: "w2" }),
    ];

    const groups = groupIssuesBySeverity(issues);

    assert.deepEqual(
      groups.map((group) => group.severity),
      ["error", "warning"]
    );
    assert.deepEqual(
      groups[1].issues.map((item) => item.message),
      ["w1", "w2"]
    );
  });

  it("returns no groups for an empty report", () => {
    assert.deepEqual(groupIssuesBySeverity([]), []);
  });
});

describe("formatIssueDay", () => {
  it("formats an issue with a day number", () => {
    assert.equal(formatIssueDay(issue({ dayNumber: 3 })), "Day 3");
  });

  it("returns null when the issue has no day", () => {
    assert.equal(formatIssueDay(issue({ code: "unassigned-place" })), null);
  });
});

describe("resolveIssuePlaceName", () => {
  it("resolves a place name from the place id", () => {
    const placeNameById = new Map([["goa-fort", "Fort Aguada"]]);

    assert.equal(
      resolveIssuePlaceName(
        issue({ code: "unassigned-place", placeId: "goa-fort" }),
        placeNameById,
        new Map()
      ),
      "Fort Aguada"
    );
  });

  it("falls back to the item name when the place id is unknown", () => {
    const itemById = new Map([
      ["item_a", item({ id: "item_a", placeName: "Night Market" })],
    ]);

    assert.equal(
      resolveIssuePlaceName(
        issue({ code: "overlapping-times", itemId: "item_a" }),
        new Map(),
        itemById
      ),
      "Night Market"
    );
  });

  it("prefers the place name over the item name", () => {
    const placeNameById = new Map([["goa-market", "Goa Market"]]);
    const itemById = new Map([
      ["item_a", item({ id: "item_a", placeName: "Stale Name" })],
    ]);

    assert.equal(
      resolveIssuePlaceName(
        issue({
          code: "inverted-time-range",
          placeId: "goa-market",
          itemId: "item_a",
        }),
        placeNameById,
        itemById
      ),
      "Goa Market"
    );
  });

  it("returns null when nothing can be resolved", () => {
    assert.equal(
      resolveIssuePlaceName(issue({ code: "empty-day", dayNumber: 2 }), new Map(), new Map()),
      null
    );
  });
});