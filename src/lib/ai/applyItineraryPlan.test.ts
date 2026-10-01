import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ApplyItineraryPlanError,
  computePlanApplication,
} from "./applyItineraryPlan";
import type {
  ApplyItineraryPlanRequest,
  ApplyItineraryProposalShape,
  PlanApplication,
} from "./applyItineraryPlan";
import type {
  ItineraryItem,
  Trip,
  TripDay,
  TripPlace,
} from "@/lib/saved/types";

const PLACE_A = "goa-palolem-beach";
const PLACE_B = "goa-dudhsagar-waterfalls";
const PLACE_C = "goa-fort-aguada";

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip_1",
    userId: "user-a",
    title: "Goa Getaway",
    destinationSlug: "goa",
    destinationName: "Goa",
    description: null,
    startDate: "2026-12-01",
    endDate: "2026-12-02",
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
    id: `tp_${overrides.placeId ?? PLACE_A}`,
    tripId: "trip_1",
    userId: "user-a",
    placeId: PLACE_A,
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
    placeId: PLACE_A,
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

function proposal(input: {
  tripId?: string;
  days?: { dayNumber: number; scheduledPlaceIds?: string[]; suggestedPlaceIds?: string[] }[];
  unassignedPlaceIds?: string[];
}): ApplyItineraryProposalShape {
  return {
    tripId: input.tripId ?? "trip_1",
    days: (input.days ?? []).map((day) => ({
      dayNumber: day.dayNumber,
      scheduledPlaceIds: day.scheduledPlaceIds ?? [],
      suggestedPlaceIds: day.suggestedPlaceIds ?? [],
    })),
    unassignedPlaceIds: input.unassignedPlaceIds ?? [],
  };
}

function request(input: {
  trip?: Trip;
  days?: TripDay[];
  places?: TripPlace[];
  items?: ItineraryItem[];
  proposal?: ApplyItineraryProposalShape;
}): ApplyItineraryPlanRequest {
  return {
    trip: input.trip ?? makeTrip(),
    days: input.days ?? [makeDay({ dayNumber: 1 }), makeDay({ dayNumber: 2 })],
    places: input.places ?? [
      makePlace({ placeId: PLACE_A, placeName: PLACE_A }),
      makePlace({ placeId: PLACE_B, placeName: PLACE_B }),
      makePlace({ placeId: PLACE_C, placeName: PLACE_C }),
    ],
    items: input.items ?? [],
    proposal: input.proposal ?? proposal({}),
  };
}

function run(input: Parameters<typeof request>[0]): PlanApplication {
  return computePlanApplication(request(input));
}

describe("computePlanApplication", () => {
  test("applies a valid proposal additively and preserves scheduled stops", () => {
    const items = [
      makeItem({ id: "item_a", tripDayId: "day_1", placeId: PLACE_A }),
    ];
    const result = run({
      items,
      proposal: proposal({
        days: [
          { dayNumber: 1, scheduledPlaceIds: [PLACE_A], suggestedPlaceIds: [PLACE_B] },
          { dayNumber: 2, suggestedPlaceIds: [PLACE_C] },
        ],
      }),
    });

    assert.equal(result.tripId, "trip_1");
    assert.equal(result.dayCount, 2);
    assert.deepEqual(
      result.additions.map((a) => [a.placeId, a.tripDayId, a.dayNumber]),
      [
        [PLACE_B, "day_1", 1],
        [PLACE_C, "day_2", 2],
      ]
    );
    assert.deepEqual(result.preservedScheduledPlaceIds, [PLACE_A]);
    assert.deepEqual(result.skipped, []);
    assert.deepEqual(result.rejected, []);
    assert.deepEqual(result.keptUnassignedPlaceIds, []);
  });

  test("rejects an unknown (or foreign) place ID instead of applying it", () => {
    const result = run({
      places: [
        makePlace({ placeId: PLACE_A, placeName: PLACE_A }),
        makePlace({ placeId: PLACE_B, placeName: PLACE_B }),
      ],
      proposal: proposal({
        days: [
          { dayNumber: 1, suggestedPlaceIds: [PLACE_B, "ghost-resort-999"] },
        ],
      }),
    });

    assert.deepEqual(
      result.additions.map((a) => a.placeId),
      [PLACE_B]
    );
    assert.deepEqual(result.rejected, [
      { placeId: "ghost-resort-999", reason: "unknown-place" },
    ]);
  });

  test("skips a suggestion that is already scheduled anywhere", () => {
    const result = run({
      items: [
        makeItem({ id: "item_a", tripDayId: "day_1", placeId: PLACE_A }),
        makeItem({ id: "item_b", tripDayId: "day_2", placeId: PLACE_B }),
      ],
      proposal: proposal({
        days: [{ dayNumber: 1, suggestedPlaceIds: [PLACE_B] }],
      }),
    });

    assert.deepEqual(result.additions, []);
    assert.deepEqual(result.skipped, [
      {
        dayNumber: 1,
        tripDayId: "day_1",
        placeId: PLACE_B,
        placeName: PLACE_B,
        reason: "already-scheduled",
      },
    ]);
  });

  test("keeps existing scheduled items unchanged", () => {
    const items = [
      makeItem({ id: "item_a", tripDayId: "day_1", placeId: PLACE_A }),
      makeItem({ id: "item_b", tripDayId: "day_2", placeId: PLACE_B }),
    ];
    const result = run({
      items,
      proposal: proposal({
        days: [
          { dayNumber: 1, scheduledPlaceIds: [PLACE_A] },
          { dayNumber: 2, scheduledPlaceIds: [PLACE_B] },
        ],
      }),
    });

    assert.deepEqual(result.preservedScheduledPlaceIds, [PLACE_A, PLACE_B]);
    assert.equal(result.additions.length, 0);
    const addedPlaceIds = new Set(result.additions.map((a) => a.placeId));
    assert.equal(addedPlaceIds.has(PLACE_A), false);
    assert.equal(addedPlaceIds.has(PLACE_B), false);
  });

  test("keeps unassigned proposal places unassigned", () => {
    const result = run({
      proposal: proposal({
        days: [{ dayNumber: 1, suggestedPlaceIds: [PLACE_A] }],
        unassignedPlaceIds: [PLACE_B],
      }),
    });

    assert.deepEqual(result.keptUnassignedPlaceIds, [PLACE_B]);
    assert.deepEqual(
      result.additions.map((a) => a.placeId),
      [PLACE_A]
    );
  });

  test("is idempotent when the same proposal is applied twice", () => {
    const p = proposal({
      days: [
        { dayNumber: 1, suggestedPlaceIds: [PLACE_B] },
        { dayNumber: 2, suggestedPlaceIds: [PLACE_C] },
      ],
    });

    const first = run({ proposal: p });
    assert.equal(first.additions.length, 2);

    const itemsAfterFirst =
      request({ proposal: p }).items.concat(
        first.additions.map((a) =>
          makeItem({ id: `item_${a.placeId}`, tripDayId: a.tripDayId, placeId: a.placeId })
        )
      );

    const second = run({ proposal: p, items: itemsAfterFirst });
    assert.deepEqual(second.additions, []);
    assert.deepEqual(
      second.skipped.map((s) => s.placeId).sort(),
      [PLACE_B, PLACE_C].sort()
    );
  });

  test("never adds the same place more than once within one proposal", () => {
    const result = run({
      proposal: proposal({
        days: [
          { dayNumber: 1, suggestedPlaceIds: [PLACE_B] },
          { dayNumber: 2, suggestedPlaceIds: [PLACE_B] },
        ],
      }),
    });

    assert.deepEqual(
      result.additions.map((a) => a.placeId),
      [PLACE_B]
    );
    assert.ok(
      result.skipped.some(
        (s) => s.placeId === PLACE_B && s.dayNumber === 2
      )
    );
  });

  test("ignores proposal days that resolve to no owned trip day", () => {
    const result = run({
      proposal: proposal({
        days: [
          { dayNumber: 99, suggestedPlaceIds: [PLACE_B] },
          { dayNumber: 1, suggestedPlaceIds: [PLACE_C] },
        ],
      }),
    });

    assert.deepEqual(
      result.additions.map((a) => a.placeId),
      [PLACE_C]
    );
  });

  test("rejects unknown ids among unassigned places without retaining them", () => {
    const result = run({
      places: [
        makePlace({ placeId: PLACE_A, placeName: PLACE_A }),
        makePlace({ placeId: PLACE_B, placeName: PLACE_B }),
      ],
      proposal: proposal({
        days: [],
        unassignedPlaceIds: [PLACE_B, "ghost-resort-999"],
      }),
    });

    assert.deepEqual(result.keptUnassignedPlaceIds, [PLACE_B]);
    assert.deepEqual(result.rejected, [
      { placeId: "ghost-resort-999", reason: "unknown-place" },
    ]);
  });

  test("throws when the proposal belongs to another trip", () => {
    assert.throws(
      () =>
        run({
          proposal: proposal({ tripId: "trip_other" }),
        }),
      (error: Error) => {
        assert.ok(error instanceof ApplyItineraryPlanError);
        assert.equal(error.code, "PROPOSAL_TRIP_MISMATCH");
        return true;
      }
    );
  });

  test("produces a deterministic application result", () => {
    const input = {
      items: [
        makeItem({ id: "item_a", tripDayId: "day_1", placeId: PLACE_A }),
      ],
      proposal: proposal({
        days: [
          { dayNumber: 1, scheduledPlaceIds: [PLACE_A], suggestedPlaceIds: [PLACE_B] },
          { dayNumber: 2, suggestedPlaceIds: [PLACE_C, "ghost-resort-999"] },
        ],
        unassignedPlaceIds: [PLACE_C],
      }),
    };

    const first = run(input);
    const second = run(input);
    assert.deepEqual(first, second);
  });
});