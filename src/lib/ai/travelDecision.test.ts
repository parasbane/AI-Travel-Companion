import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTravelDecision,
  parseRequestedTiming,
} from "@/lib/ai/travelDecision";
import type { TravelDecisionInput } from "@/lib/ai/travelDecision";
import type {
  AiWeatherContext,
  AiWeatherForecastDay,
} from "@/lib/ai/weatherContext";
import type { AssistantCandidatePlace } from "@/lib/ai/types";

function makePlace(overrides: Partial<AssistantCandidatePlace> = {}): AssistantCandidatePlace {
  return {
    placeId: "place_food_1",
    slug: "bom-bahia",
    name: "Bom Bahia",
    destination: "Goa",
    destinationSlug: "goa",
    category: "food",
    priceLevel: "budget",
    rating: 4.6,
    reviewCount: 342,
    address: "Panaji, Goa",
    coordinates: { latitude: 15.4909, longitude: 73.8278 },
    tags: ["seafood", "local"],
    matchScore: 92,
    rankPosition: 1,
    source: "place-provider",
    ...overrides,
  };
}

function makeWeatherDaily(
  overrides: Partial<AiWeatherForecastDay> = {}
): AiWeatherForecastDay {
  return {
    date: "2026-09-25",
    dayLabel: "Friday",
    condition: "Moderate rain",
    conditionCode: 55,
    highC: 24,
    lowC: 21,
    precipitationProbabilityPercent: 80,
    ...overrides,
  };
}

function makeWeather(
  dailies: AiWeatherForecastDay[] = [makeWeatherDaily()]
): AiWeatherContext {
  return {
    destinationSlug: "goa",
    destinationName: "Goa",
    retrievedAt: "2026-09-25T08:00:00Z",
    current: {
      condition: "Moderate rain",
      conditionCode: 55,
      observedAt: "2026-09-25T08:00:00Z",
      temperatureC: 22,
      apparentTemperatureC: 23,
    },
    forecast: dailies,
    summary: "Rainy in Goa.",
  };
}

function makeInput(
  overrides: Partial<TravelDecisionInput> = {}
): TravelDecisionInput {
  return {
    destinationSlug: "goa",
    candidatePlaces: [
      makePlace({ placeId: "goa-bom-bahia", category: "food", priceLevel: "budget", matchScore: 92 }),
      makePlace({ placeId: "goa-palolem", category: "nature", priceLevel: "moderate", matchScore: 80, rating: 4.2, name: "Palolem Beach" }),
    ],
    preferences: { styles: ["food"], budget: "balanced", group: "couple" },
    ...overrides,
  };
}

describe("parseRequestedTiming", () => {
  it("returns dateNamed=false for a message with no day phrase", () => {
    const result = parseRequestedTiming("Which place should we visit?", "2026-09-25T12:00:00Z");
    assert.equal(result.dateNamed, false);
    assert.equal(result.requestedDate, undefined);
    assert.equal(result.partOfDay, undefined);
  });

  it("resolves today to the caller's calendar date", () => {
    const result = parseRequestedTiming("What can we do today?", "2026-09-25T12:00:00Z");
    assert.equal(result.dateNamed, true);
    assert.equal(result.requestedDate, "2026-09-25");
  });

  it("resolves tomorrow to the next calendar date", () => {
    const result = parseRequestedTiming("Best for tomorrow morning?", "2026-09-25T12:00:00Z");
    assert.equal(result.dateNamed, true);
    assert.equal(result.requestedDate, "2026-09-26");
    assert.equal(result.partOfDay, "morning");
  });

  it("resolves a named weekday to its next occurrence", () => {
    // 2026-09-25 is a Friday; next Tuesday is 2026-09-29.
    const result = parseRequestedTiming("something on tuesday afternoon", "2026-09-25T12:00:00Z");
    assert.equal(result.dateNamed, true);
    assert.equal(result.requestedDate, "2026-09-29");
    assert.equal(result.partOfDay, "afternoon");
  });
});

describe("buildTravelDecision — conventions", () => {
  it("never mutates its inputs", () => {
    const input = makeInput();
    const placesSnapshot = JSON.parse(JSON.stringify(input.candidatePlaces));
    const prefsSnapshot = JSON.parse(JSON.stringify(input.preferences));

    buildTravelDecision(input);

    assert.deepEqual(input.candidatePlaces, placesSnapshot);
    assert.deepEqual(input.preferences, prefsSnapshot);
  });

  it("is deterministic: identical inputs produce identical rankings", () => {
    const a = buildTravelDecision(makeInput());
    const b = buildTravelDecision(makeInput());
    assert.deepEqual(a.rankedPlaces, b.rankedPlaces);
    assert.equal(a.summary, b.summary);
    assert.deepEqual(a, b);
  });

  it("degrades gracefully (resolve => no fabricated facts) when weather is absent", () => {
    const result = buildTravelDecision(makeInput({ weather: null }));
    assert.equal(result.usedWeather, false);
    assert.deepEqual(result.weatherFitPlaceIds, []);
    assert.equal(result.missingSignals.includes("weather"), true);
    // Must not claim a weather condition that was never supplied.
    assert.equal(result.summary.includes("rain"), false);
  });

  it("reports missing signals when signals are unavailable", () => {
    const result = buildTravelDecision(
      makeInput({ weather: null, preferences: undefined })
    );
    assert.equal(result.missingSignals.includes("weather"), true);
    // No personalization preferences were supplied.
    assert.equal(result.missingSignals.includes("trip"), true);

    // Every place in the result must come from the grounded candidate set.
    const groundedIds = new Set(
      makeInput({ weather: null, preferences: undefined }).candidatePlaces.map(
        (place) => place.placeId
      )
    );
    for (const place of result.rankedPlaces) {
      assert.equal(groundedIds.has(place.placeId), true);
    }
  });

  it("keeps a stable primary recommendation", () => {
    const result = buildTravelDecision(makeInput());
    assert.ok(result.primary);
    assert.equal(result.primary.placeId, result.rankedPlaces[0].placeId);
  });
});

describe("buildTravelDecision — preference signals", () => {
  it("factors the traveller's style preferences into the ranking", () => {
    const result = buildTravelDecision(
      makeInput({
        preferences: { styles: ["food"], budget: "balanced", group: "couple" },
      })
    );
    const food = result.rankedPlaces.find((place) => place.placeId === "goa-bom-bahia");
    assert.ok(food);
    assert.deepEqual(
      food.factors.map((factor) => factor.kind).filter((kind) => kind === "style"),
      ["style"]
    );
    assert.equal(result.usedPreferences, true);
    assert.equal(result.summary.includes("using your travel preferences"), true);
  });

  it("group-aware: only categories that suit the travel group get a group factor", () => {
    const result = buildTravelDecision(
      makeInput({ preferences: { styles: [], budget: "balanced", group: "family" } })
    );
    // family boosts nature/attractions, so the nature place is the group fit.
    const nature = result.rankedPlaces.find((place) => place.placeId === "goa-palolem");
    const food = result.rankedPlaces.find((place) => place.placeId === "goa-bom-bahia");
    assert.ok(nature && food);
    assert.ok(nature.factors.some((factor) => factor.kind === "group"));
    assert.equal(food.factors.some((factor) => factor.kind === "group"), false);
  });

  it("budget-aware: only price levels inside the budget affinity get a budget factor", () => {
    const result = buildTravelDecision(
      makeInput({ preferences: { styles: [], budget: "luxury", group: "couple" } })
    );
    // luxury strong-affinities moderate/expensive; the nature place is moderate.
    const nature = result.rankedPlaces.find((place) => place.placeId === "goa-palolem");
    const food = result.rankedPlaces.find((place) => place.placeId === "goa-bom-bahia");
    assert.ok(nature && food);
    assert.ok(nature.factors.some((factor) => factor.kind === "budget"));
    // The budget place is only a soft luxury fit, and food is soft for luxury.
    assert.equal(
      nature.factors.some((factor) => factor.label === "Fits your luxury budget"),
      true
    );
    assert.equal(
      food.factors.some((factor) => factor.label === "Fits your luxury budget"),
      false
    );
  });
});

describe("buildTravelDecision — weather signals", () => {
  it("rainy-day: ranks indoor categories above outdoor ones on a rainy day", () => {
    const result = buildTravelDecision(
      makeInput({ weather: makeWeather() }) // code 55 => indoor/rain
    );
    assert.equal(result.usedWeather, true);
    assert.deepEqual(result.weatherFitPlaceIds, ["goa-bom-bahia"]);

    const food = result.rankedPlaces.find((place) => place.placeId === "goa-bom-bahia");
    const nature = result.rankedPlaces.find((place) => place.placeId === "goa-palolem");
    assert.ok(food && nature);
    assert.ok(food.factors.some((factor) => factor.kind === "weather"));
    assert.equal(nature.factors.some((factor) => factor.kind === "weather"), false);
    assert.ok(food.score > nature.score);
  });

  it("high-heat: an outdoor code still becomes an indoor lean at or above the heat threshold", () => {
    const result = buildTravelDecision(
      makeInput({
        weather: makeWeather([
          makeWeatherDaily({ conditionCode: 0, highC: 36, precipitationProbabilityPercent: 0 }),
        ]),
      })
    );
    assert.equal(result.usedWeather, true);
    assert.deepEqual(result.weatherFitPlaceIds, ["goa-bom-bahia"]);

    const food = result.rankedPlaces.find((place) => place.placeId === "goa-bom-bahia");
    assert.ok(food);
    const heat = food.factors.find((factor) => factor.kind === "weather");
    assert.ok(heat);
    assert.equal(heat.label, "Good for a hot day (36°C)");
  });

  it("clear-weather: ranks outdoor categories above indoor ones on a clear mild day", () => {
    const result = buildTravelDecision(
      makeInput({
        // Equal grounded baselines so the weather delta is the only difference.
        candidatePlaces: [
          makePlace({ placeId: "goa-palolem", category: "nature", priceLevel: "moderate", matchScore: 80, rating: 4.0, name: "Palolem Beach", tags: ["beach"] }),
          makePlace({ placeId: "goa-bom-bahia", category: "food", priceLevel: "budget", matchScore: 80, rating: 4.0, tags: ["seafood"] }),
        ],
        preferences: undefined,
        weather: makeWeather([
          makeWeatherDaily({ condition: "Clear sky", conditionCode: 0, highC: 24, precipitationProbabilityPercent: 0 }),
        ]),
      })
    );
    assert.equal(result.usedWeather, true);
    assert.deepEqual(result.weatherFitPlaceIds, ["goa-palolem"]);

    const nature = result.rankedPlaces.find((place) => place.placeId === "goa-palolem");
    const food = result.rankedPlaces.find((place) => place.placeId === "goa-bom-bahia");
    assert.ok(nature && food);
    assert.ok(nature.factors.some((factor) => factor.kind === "weather"));
    assert.equal(food.factors.some((factor) => factor.kind === "weather"), false);
    // Outdoor gains +8 and indoor loses 8 off the same baseline.
    assert.equal(nature.score - food.score, 16);
    assert.equal(result.rankedPlaces[0].placeId, "goa-palolem");
  });

  it("balanced weather boosts nothing, so no place claims a weather factor", () => {
    const result = buildTravelDecision(
      makeInput({
        weather: makeWeather([
          makeWeatherDaily({ condition: "Cloudy", conditionCode: 45, highC: 24, precipitationProbabilityPercent: 30 }),
        ]),
      })
    );
    assert.equal(result.usedWeather, true);
    assert.deepEqual(result.weatherFitPlaceIds, []);
    for (const place of result.rankedPlaces) {
      assert.equal(place.factors.some((factor) => factor.kind === "weather"), false);
    }
  });
});

describe("buildTravelDecision — trip context", () => {
  it("itinerary-aware: boosts only the places already in the traveller's trip", () => {
    const result = buildTravelDecision(
      makeInput({ scheduledPlaceIds: ["goa-palolem"] })
    );
    assert.equal(result.usedTrip, true);
    assert.deepEqual(result.scheduledPlaceIds, ["goa-palolem"]);

    const nature = result.rankedPlaces.find((place) => place.placeId === "goa-palolem");
    const food = result.rankedPlaces.find((place) => place.placeId === "goa-bom-bahia");
    assert.ok(nature && food);
    assert.equal(
      nature.factors.some((factor) => factor.label === "Already in your itinerary"),
      true
    );
    assert.equal(
      food.factors.some((factor) => factor.label === "Already in your itinerary"),
      false
    );
    assert.ok(
      result.summary.includes("aligned with your itinerary of 1 planned place(s)")
    );
  });

  it("trip context beats a higher raw match score", () => {
    const withTrip = buildTravelDecision(
      makeInput({ scheduledPlaceIds: ["goa-palolem"] })
    );
    const withoutTrip = buildTravelDecision(makeInput());
    const natureWith = withTrip.rankedPlaces.find((place) => place.placeId === "goa-palolem");
    const natureWithout = withoutTrip.rankedPlaces.find(
      (place) => place.placeId === "goa-palolem"
    );
    assert.ok(natureWith && natureWithout);
    // ITINERARY_BOOST is +6 on top of the identical grounded match score.
    assert.equal(natureWith.score - natureWithout.score, 6);
  });
});

describe("buildTravelDecision — timing signals", () => {
  it("timing-aware: uses the forecast day the traveller actually asked for", () => {
    const timing = parseRequestedTiming(
      "what should we do tomorrow?",
      "2026-09-25T12:00:00Z"
    );
    const result = buildTravelDecision(
      makeInput({
        timing,
        weather: makeWeather([
          makeWeatherDaily({ date: "2026-09-25", dayLabel: "Friday", conditionCode: 0, highC: 24, precipitationProbabilityPercent: 0 }),
          makeWeatherDaily({ date: "2026-09-26", dayLabel: "Saturday", conditionCode: 0, highC: 24, precipitationProbabilityPercent: 0 }),
        ]),
      })
    );
    assert.equal(result.usedTiming, true);
    assert.deepEqual(result.weatherFitPlaceIds, ["goa-palolem"]);
    // The named day drives the summary, not just today's forecast.
    assert.ok(result.summary.includes("for Saturday"));
  });

  it("timing-aware: a named day missing from the forecast is reported, never guessed", () => {
    const timing = parseRequestedTiming(
      "what should we do tomorrow?",
      "2026-09-25T12:00:00Z"
    );
    const result = buildTravelDecision(makeInput({ timing, weather: makeWeather() }));
    assert.equal(result.usedTiming, false);
    assert.equal(result.usedWeather, false);
    assert.ok(result.missingSignals.includes("timing"));
    assert.equal(result.summary.includes("Saturday"), false);
  });
});

describe("parseRequestedTiming — part of day", () => {
  it("detects each grounded part of day", () => {
    const nowIso = "2026-09-25T12:00:00Z";
    assert.equal(parseRequestedTiming("anything for dinner tonight?", nowIso).partOfDay, "night");
    assert.equal(parseRequestedTiming("best time tomorrow evening", nowIso).partOfDay, "evening");
    assert.equal(parseRequestedTiming("what about lunch tomorrow", nowIso).partOfDay, "afternoon");
    assert.equal(parseRequestedTiming("early start tomorrow morning", nowIso).partOfDay, "morning");
  });

  it("treats tonight as today", () => {
    const result = parseRequestedTiming("anything for tonight?", "2026-09-25T12:00:00Z");
    assert.equal(result.dateNamed, true);
    assert.equal(result.requestedDate, "2026-09-25");
  });

  it("rolls a named weekday forward to its next occurrence, never today", () => {
    const result = parseRequestedTiming("maybe friday", "2026-09-25T12:00:00Z");
    assert.equal(result.dateNamed, true);
    // 2026-09-25 is itself a Friday, so "friday" means the following week.
    assert.equal(result.requestedDate, "2026-10-02");
  });

  it("is case-insensitive and tolerates an empty message", () => {
    const nowIso = "2026-09-25T12:00:00Z";
    assert.equal(parseRequestedTiming("WHAT ABOUT TOMORROW?", nowIso).requestedDate, "2026-09-26");
    const empty = parseRequestedTiming("", nowIso);
    assert.equal(empty.dateNamed, false);
    assert.equal(empty.partOfDay, undefined);
  });
});

describe("buildTravelDecision — no candidates", () => {
  it("returns an empty, non-fabricated decision for an empty candidate list", () => {
    const result = buildTravelDecision(makeInput({ candidatePlaces: [] }));
    assert.deepEqual(result.rankedPlaces, []);
    assert.equal(result.primary, null);
    assert.deepEqual(result.weatherFitPlaceIds, []);
    assert.ok(result.summary.includes("Ranked 0 grounded places"));
  });
});

describe("buildTravelDecision — saved places", () => {
  it("restricts the decision to the saved places the traveller asked about", () => {
    const result = buildTravelDecision(
      makeInput({ restrictToPlaceIds: ["goa-palolem"] })
    );
    assert.equal(result.usedSavedPlaces, true);
    assert.deepEqual(
      result.rankedPlaces.map((place) => place.placeId),
      ["goa-palolem"]
    );
    assert.ok(
      result.summary.includes("limited to the saved places you asked about")
    );
  });

  it("ignores saved-place ids that are not grounded candidates", () => {
    const result = buildTravelDecision(
      makeInput({ restrictToPlaceIds: ["goa-does-not-exist"] })
    );
    assert.equal(result.usedSavedPlaces, true);
    assert.deepEqual(result.rankedPlaces, []);
    assert.equal(result.primary, null);
  });
});
