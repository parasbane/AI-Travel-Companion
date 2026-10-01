import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DeterministicItineraryPlanner,
  ItineraryPlannerError,
  MAX_SUGGESTIONS_PER_DAY,
  createItineraryPlanner,
  getDefaultItineraryPlanner,
  normalizeInstruction,
  planItinerary,
  setDefaultItineraryPlanner,
} from "./itineraryPlanner";
import type { ItineraryPlanner, ItineraryProposal } from "./itineraryPlanner";
import type { AiWeatherContext } from "./weatherContext";
import type {
  ItineraryItem,
  Trip,
  TripDay,
  TripPlace,
} from "@/lib/saved/types";

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

function request(input: {
  trip?: Trip;
  days?: TripDay[];
  places?: TripPlace[];
  items?: ItineraryItem[];
  preferences?: unknown;
  instruction?: unknown;
}) {
  return planItinerary({
    trip: input.trip ?? makeTrip(),
    days: input.days ?? [],
    places: input.places ?? [],
    items: input.items ?? [],
    preferences: input.preferences === undefined ? null : (input.preferences as never),
    instruction: input.instruction === undefined ? null : (input.instruction as never),
  });
}

describe("normalizeInstruction", () => {
  test("returns null for missing or empty input", () => {
    assert.equal(normalizeInstruction(null), null);
    assert.equal(normalizeInstruction(undefined), null);
    assert.equal(normalizeInstruction("   "), null);
  });

  test("trims and collapses whitespace", () => {
    assert.equal(normalizeInstruction("  Plan  a   relaxed\ntrip  "), "Plan a relaxed trip");
  });
});

describe("validateItineraryPlannerRequest / planItinerary validity", () => {
  test("throws for an invalid request", () => {
    assert.throws(
      () => planItinerary(undefined as never),
      (error: Error) => {
        assert.ok(error instanceof ItineraryPlannerError);
        assert.equal(error.code, "INVALID_REQUEST");
        return true;
      }
    );
  });

  test("rejects a missing valid trip id", () => {
    const trip = { ...makeTrip(), id: "" };
    assert.throws(() => request({ trip }), /trip with a valid id/);
  });

  test("rejects non-array days, places, and items", () => {
    assert.throws(
      () => planItinerary({ trip: makeTrip(), days: null as never, places: [], items: [] }),
      /days must be an array/
    );
    assert.throws(
      () =>
        planItinerary({
          trip: makeTrip(),
          days: [],
          places: {} as never,
          items: [],
        }),
      /places must be an array/
    );
    assert.throws(
      () =>
        planItinerary({
          trip: makeTrip(),
          days: [],
          places: [],
          items: "nope" as never,
        }),
      /items must be an array/
    );
  });

  test("rejects unsupported preference values and non-string instruction", () => {
    assert.throws(
      () => request({ preferences: { budget: "extreme" } }),
      /preferences must use supported/
    );
    assert.throws(
      () => request({ preferences: { group: "family" }, instruction: 42 }),
      /instruction must be a string/
    );
  });
});

describe("DeterministicItineraryPlanner", () => {
  test("returns an empty proposal for an empty trip", () => {
    const proposal = request({
      days: [],
      places: [],
      items: [],
      preferences: { styles: ["culture"] },
    });

    assert.equal(proposal.tripId, "trip_1");
    assert.equal(proposal.dayCount, 0);
    assert.equal(proposal.days.length, 0);
    assert.equal(proposal.scheduleCount, 0);
    assert.equal(proposal.suggestionCount, 0);
    assert.deepEqual(proposal.unassignedPlaceIds, []);
    assert.equal(proposal.usedPreferences, true);
    assert.equal(proposal.source, "deterministic");
  });

  test("builds a single-day proposal placing every unassigned place", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const a = makePlace({ id: "tp_1", placeId: "goa-palolem-beach", placeName: "Palolem Beach" });
    const b = makePlace({ id: "tp_2", placeId: "goa-market", placeName: "Goa Market" });

    const proposal = request({ days: [day1], places: [a, b] });

    assert.equal(proposal.dayCount, 1);
    assert.deepEqual(proposal.days[0].suggestedPlaceIds, ["goa-palolem-beach", "goa-market"]);
    assert.deepEqual(proposal.days[0].orderedPlaceIds, ["goa-palolem-beach", "goa-market"]);
    assert.equal(proposal.days[0].label, "Dec 1, 2026");
    assert.equal(proposal.suggestionCount, 2);
    assert.deepEqual(proposal.unassignedPlaceIds, []);
  });

  test("distributes suggestions evenly across a multi-day trip", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const day3 = makeDay({ id: "day_3", dayNumber: 3, date: "2026-12-03" });
    const places = Array.from({ length: 6 }).map((_, idx) =>
      makePlace({
        id: `tp_${idx + 1}`,
        placeId: `goa-place-${idx + 1}`,
        placeName: `Place ${idx + 1}`,
      })
    );

    const proposal = request({ days: [day1, day2, day3], places });

    assert.deepEqual(
      proposal.days.map((d) => d.suggestionCount),
      [2, 2, 2]
    );
  });

  test("never suggests the same place twice and never invents place ids", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day2 = makeDay({ id: "day_2", dayNumber: 2 });
    const day3 = makeDay({ id: "day_3", dayNumber: 3 });
    const pool = ["goa-a", "goa-b", "goa-c", "goa-d", "goa-e"];
    const places = pool.map((placeId, idx) =>
      makePlace({ id: `tp_${idx + 1}`, placeId, placeName: placeId })
    );

    const proposal = request({ days: [day1, day2, day3], places });

    const seen = new Set<string>();
    for (const day of proposal.days) {
      for (const id of day.suggestedPlaceIds) {
        assert.equal(seen.has(id), false, `${id} suggested twice`);
        seen.add(id);
      }
    }
    for (const id of [...seen, ...proposal.unassignedPlaceIds]) {
      assert.equal(pool.includes(id), true, `${id} was invented`);
    }
  });

  test("preserves existing scheduled places and never re-suggests them", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const scheduled = makePlace({ id: "tp_1", placeId: "goa-palolem-beach", placeName: "Palolem Beach" });
    const pool = [
      scheduled,
      makePlace({ id: "tp_2", placeId: "goa-market", placeName: "Goa Market" }),
      makePlace({ id: "tp_3", placeId: "goa-fort", placeName: "Goa Fort" }),
    ];
    const items = [
      makeItem({ tripDayId: "day_1", id: "item_a", placeId: "goa-palolem-beach", sortOrder: 0 }),
    ];

    const proposal = request({ days: [day1, day2], places: pool, items });

    assert.deepEqual(proposal.days[0].scheduledPlaceIds, ["goa-palolem-beach"]);
    assert.equal(proposal.days[0].scheduleCount, 1);
    assert.equal(proposal.days[1].scheduledPlaceIds.length, 0);
    assert.equal(proposal.scheduleCount, 1);

    const allSuggested = proposal.days.flatMap((d) => d.suggestedPlaceIds);
    assert.equal(allSuggested.includes("goa-palolem-beach"), false);
    assert.deepEqual(new Set(allSuggested), new Set(["goa-market", "goa-fort"]));
    assert.match(proposal.days[0].reasoning, /kept 1 already scheduled stop/);
    assert.match(proposal.days[0].reasoning, /added 1 suggestion/);
  });

  test("ranks suggestions by match score when preferences exist", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day2 = makeDay({ id: "day_2", dayNumber: 2 });
    const culture = makePlace({
      id: "tp_1",
      placeId: "goa-basilica",
      placeName: "Basilica of Bom Jesus",
      placeCategory: "culture",
      placePriceLevel: "budget",
      placeRating: 4.6,
    });
    const relaxation = makePlace({
      id: "tp_2",
      placeId: "goa-palolem-beach",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
      placePriceLevel: "budget",
      placeRating: 4.7,
    });

    const proposal = request({
      days: [day1, day2],
      places: [relaxation, culture],
      preferences: { styles: ["culture"], group: "family" },
    });

    assert.equal(proposal.usedPreferences, true);
    assert.equal(proposal.days[0].suggestedPlaceIds[0], "goa-basilica");
    assert.deepEqual(proposal.unassignedPlaceIds, []);
  });

  test("keeps pool order when there are no preferences", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const a = makePlace({ id: "tp_1", placeId: "goa-palolem-beach" });
    const b = makePlace({ id: "tp_2", placeId: "goa-market" });

    const proposal = request({ days: [day1], places: [a, b] });

    assert.equal(proposal.usedPreferences, false);
    assert.deepEqual(proposal.days[0].suggestedPlaceIds, ["goa-palolem-beach", "goa-market"]);
    assert.match(proposal.days[0].reasoning, /added 2 suggestions/);
  });

  test("keeps a place scheduled on multiple days out of suggestions on every day", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day2 = makeDay({ id: "day_2", dayNumber: 2 });
    const items = [
      makeItem({ tripDayId: "day_1", id: "item_a", placeId: "goa-palolem-beach" }),
      makeItem({ tripDayId: "day_2", id: "item_b", placeId: "goa-palolem-beach" }),
    ];
    const pool = [
      makePlace({ id: "tp_1", placeId: "goa-palolem-beach" }),
      makePlace({ id: "tp_2", placeId: "goa-market" }),
    ];

    const proposal = request({ days: [day1, day2], places: pool, items });

    assert.deepEqual(proposal.days[0].scheduledPlaceIds, ["goa-palolem-beach"]);
    assert.deepEqual(proposal.days[1].scheduledPlaceIds, ["goa-palolem-beach"]);
    const allSuggested = proposal.days.flatMap((d) => d.suggestedPlaceIds);
    assert.deepEqual(allSuggested, ["goa-market"]);
    assert.equal(proposal.scheduleCount, 2);
  });

  test("leaves overflow unassigned rather than overfilling any day", () => {
    const days = [1, 2, 3].map((number) =>
      makeDay({ id: `day_${number}`, dayNumber: number })
    );
    const poolCount = MAX_SUGGESTIONS_PER_DAY * 3 + 1;
    const places = Array.from({ length: poolCount }).map((_, idx) =>
      makePlace({
        id: `tp_${idx + 1}`,
        placeId: `goa-place-${idx + 1}`,
        placeName: `Place ${idx + 1}`,
      })
    );

    const proposal = request({ days, places });

    for (const day of proposal.days) {
      assert.ok(day.suggestionCount <= MAX_SUGGESTIONS_PER_DAY, `Day ${day.dayNumber} overfilled`);
    }
    assert.equal(proposal.suggestionCount, MAX_SUGGESTIONS_PER_DAY * 3);
    assert.equal(proposal.unassignedPlaceIds.length, 1);
  });

  test("handles insufficient places without error or unassigned leftovers", () => {
    const days = [1, 2, 3].map((number) =>
      makeDay({ id: `day_${number}`, dayNumber: number })
    );
    const places = [
      makePlace({ id: "tp_1", placeId: "goa-a" }),
      makePlace({ id: "tp_2", placeId: "goa-b" }),
    ];

    const proposal = request({ days, places });

    assert.deepEqual(
      proposal.days.map((d) => d.suggestionCount),
      [1, 1, 0]
    );
    assert.deepEqual(proposal.unassignedPlaceIds, []);
    assert.match(proposal.days[2].reasoning, /No places to assign/);
  });

  test("ignores items that reference unknown days but never re-suggests them", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const items = [
      makeItem({ tripDayId: "ghost-day", id: "item_a", placeId: "goa-palolem-beach" }),
    ];
    const pool = [
      makePlace({ id: "tp_1", placeId: "goa-palolem-beach" }),
      makePlace({ id: "tp_2", placeId: "goa-market" }),
    ];

    const proposal = request({ days: [day1], places: pool, items });

    assert.deepEqual(proposal.days[0].scheduledPlaceIds, []);
    assert.deepEqual(proposal.days[0].suggestedPlaceIds, ["goa-market"]);
    assert.deepEqual(proposal.unassignedPlaceIds, []);
  });

  test("produces deterministic output for identical inputs", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1 });
    const day2 = makeDay({ id: "day_2", dayNumber: 2 });
    const places = Array.from({ length: 5 }).map((_, idx) =>
      makePlace({ id: `tp_${idx + 1}`, placeId: `goa-place-${idx + 1}` })
    );

    const first = request({ days: [day1, day2], places });
    const second = request({ days: [day1, day2], places });

    assert.deepEqual(first, second);
  });

  test("sort deduplicated day numbers deterministically", () => {
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const day1a = makeDay({ id: "day_1a", dayNumber: 1, date: "2026-12-01" });
    const day1b = makeDay({ id: "day_1b", dayNumber: 1, date: "2026-12-01" });
    const day3 = makeDay({ id: "day_3", dayNumber: 3, date: "2026-12-03" });

    const proposal = request({
      days: [day3, day1b, day2, day1a],
      places: [makePlace()],
    });

    assert.deepEqual(
      proposal.days.map((d) => d.dayNumber),
      [1, 2, 3]
    );
  });
});

describe("ItineraryPlanner factory and DI", () => {
  test("createItineraryPlanner returns a deterministic planner by default", () => {
    const planner = createItineraryPlanner();
    assert.ok(planner instanceof DeterministicItineraryPlanner);
    assert.equal(planner.id, "deterministic");
  });

  test("setDefaultItineraryPlanner swaps the planner used by planItinerary", () => {
    const original = getDefaultItineraryPlanner();
    const custom: ItineraryPlanner = {
      id: "custom",
      plan: (): ItineraryProposal =>
        ({
          tripId: "trip_1",
          title: "Goa Getaway",
          destinationName: "Goa",
          destinationSlug: "goa",
          startDate: "2026-12-01",
          endDate: "2026-12-03",
          dayCount: 0,
          instruction: null,
          usedPreferences: false,
          scheduleCount: 0,
          suggestionCount: 0,
          unassignedPlaceIds: [],
          days: [],
          source: "custom",
        }) as ItineraryProposal,
    };

    try {
      setDefaultItineraryPlanner(custom);
      const proposal = planItinerary({
        trip: makeTrip(),
        days: [],
        places: [],
        items: [],
        preferences: null,
        instruction: null,
      });
      assert.equal(proposal.source, "custom");
    } finally {
      setDefaultItineraryPlanner(original);
    }
  });
});

describe("DeterministicItineraryPlanner weather-aware notes", () => {
  function makeWeather(): AiWeatherContext {
    return {
      destinationSlug: "goa",
      destinationName: "Goa",
      retrievedAt: "2026-11-20T10:00:00Z",
      current: {
        condition: "Light rain",
        conditionCode: 61,
        temperatureC: 25,
        apparentTemperatureC: 28,
        observedAt: "2026-11-20T10:00:00Z",
      },
      forecast: [
        {
          date: "2026-12-01",
          dayLabel: "Tuesday",
          condition: "Moderate rain",
          conditionCode: 61,
          highC: 27,
          lowC: 24,
          precipitationProbabilityPercent: 90,
        },
        {
          date: "2026-12-02",
          dayLabel: "Wednesday",
          condition: "Clear sky",
          conditionCode: 1,
          highC: 31,
          lowC: 26,
          precipitationProbabilityPercent: 5,
        },
      ],
      summary: "In Goa: Currently Light rain at 25°C.",
    };
  }

  test("annotates only days whose calendarDate matches a grounded forecast day", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const day3 = makeDay({ id: "day_3", dayNumber: 3, date: "2026-12-03" });
    const places = [
      makePlace({ id: "tp_1", placeId: "goa-a" }),
      makePlace({ id: "tp_2", placeId: "goa-b" }),
      makePlace({ id: "tp_3", placeId: "goa-c" }),
    ];

    const proposal = planItinerary({
      trip: makeTrip(),
      days: [day1, day2, day3],
      places,
      items: [],
      preferences: null,
      instruction: null,
      weather: makeWeather(),
    });

    assert.match(proposal.days[0].reasoning, /Forecast for this day: Moderate rain, 27°C \/ 24°C, 90% rain\./);
    assert.match(proposal.days[1].reasoning, /Forecast for this day: Clear sky, 31°C \/ 26°C, 5% rain\./);
    assert.equal(proposal.days[2].reasoning.includes("Forecast for this day"), false);
  });

  test("adds no weather note when weather is absent (graceful)", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const proposal = planItinerary({
      trip: makeTrip(),
      days: [day1],
      places: [],
      items: [],
      preferences: null,
      instruction: null,
      weather: null,
    });
    assert.equal(proposal.days[0].reasoning.includes("Forecast for this day"), false);
  });

  test("weather notes are purely additive and never change scheduling", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const day2 = makeDay({ id: "day_2", dayNumber: 2, date: "2026-12-02" });
    const places = [
      makePlace({ id: "tp_1", placeId: "goa-a" }),
      makePlace({ id: "tp_2", placeId: "goa-b" }),
    ];

    const withoutWeather = planItinerary({
      trip: makeTrip(),
      days: [day1, day2],
      places,
      items: [],
      preferences: null,
      instruction: null,
    });
    const withWeather = planItinerary({
      trip: makeTrip(),
      days: [day1, day2],
      places,
      items: [],
      preferences: null,
      instruction: null,
      weather: makeWeather(),
    });

    assert.deepEqual(
      withWeather.days.map((d) => d.scheduledPlaceIds),
      withoutWeather.days.map((d) => d.scheduledPlaceIds)
    );
    assert.deepEqual(
      withWeather.days.map((d) => d.suggestedPlaceIds),
      withoutWeather.days.map((d) => d.suggestedPlaceIds)
    );
    assert.deepEqual(
      withWeather.days.map((d) => d.scheduleCount),
      withoutWeather.days.map((d) => d.scheduleCount)
    );
  });

  test("does not leak temperatures or conditions into reasoning that has no forecast day", () => {
    const day1 = makeDay({ id: "day_1", dayNumber: 1, date: "2026-12-01" });
    const proposal = planItinerary({
      trip: makeTrip(),
      days: [day1],
      places: [
        makePlace({ id: "tp_1", placeId: "goa-a" }),
        makePlace({ id: "tp_2", placeId: "goa-b" }),
      ],
      items: [],
      preferences: null,
      instruction: null,
      weather: {
        ...makeWeather(),
        forecast: [
          {
            date: "2026-01-01",
            dayLabel: "Thursday",
            condition: "Heavy rain",
            conditionCode: 82,
            highC: 20,
            lowC: 17,
            precipitationProbabilityPercent: 95,
          },
        ],
      },
    });

    assert.equal(proposal.days[0].reasoning.includes("Heavy rain"), false);
    assert.equal(proposal.days[0].reasoning.includes("20°C"), false);
  });
});