import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DestinationInfo } from "@/lib/places/types";
import { buildTripPlan } from "@/lib/saved/tripPlan";
import { analyzeTripPlan } from "@/lib/saved/tripPlanReport";
import type { ItineraryItem, Trip, TripDay, TripPlace, TripPlanIssue } from "@/lib/saved/types";
import {
  buildGeminiGroundedResponse,
  buildGeminiSystemInstruction,
  buildGeminiUserPrompt,
  callGeminiForTravel,
  isRetryableGeminiError,
  parseGeminiJsonResponse,
  setGeminiClientForTesting,
  setGeminiRetryDelaysForTesting,
} from "./gemini";
import { buildTravelDecision, parseRequestedTiming } from "./travelDecision";
import type { AssistantCandidatePlace, TravelContext } from "./types";
import type { AiWeatherContext } from "./weatherContext";

function makeWeatherContext(): AiWeatherContext {
  return {
    destinationSlug: "tokyo",
    destinationName: "Tokyo",
    retrievedAt: "2026-09-16T10:00:00Z",
    current: {
      condition: "Light rain",
      conditionCode: 61,
      temperatureC: 25,
      apparentTemperatureC: 28,
      observedAt: "2026-09-16T10:00:00Z",
    },
    forecast: [
      {
        date: "2026-09-17",
        dayLabel: "Thursday",
        condition: "Moderate rain",
        conditionCode: 61,
        highC: 27,
        lowC: 24,
        precipitationProbabilityPercent: 90,
      },
    ],
    summary: "In Tokyo: Currently Light rain at 25°C. Forecast: Thursday: Moderate rain, 27°C / 24°C, 90% rain.",
  };
}

const destination: DestinationInfo = {
  slug: "tokyo",
  name: "Tokyo",
  country: "Japan",
  description: "A bustling metropolis blending modern style with rich heritage.",
  bestTimeToVisit: "March to May",
  coordinates: { latitude: 35.6762, longitude: 139.6503 },
  heroImageUrl: "https://example.com/tokyo.jpg",
  popularCategories: ["culture", "food"],
  totalPlaces: 2,
};

const candidatePlaces: AssistantCandidatePlace[] = [
  {
    placeId: "tokyo-sensoji",
    slug: "sensoji-temple",
    name: "Senso-ji Temple",
    destination: "Tokyo",
    destinationSlug: "tokyo",
    category: "culture",
    priceLevel: "budget",
    rating: 4.8,
    reviewCount: 3500,
    address: "Asakusa, Tokyo",
    coordinates: { latitude: 35.7148, longitude: 139.7967 },
    tags: ["Historic", "Temple"],
    matchScore: 95,
    rankPosition: 1,
    source: "place-provider",
  },
  {
    placeId: "tokyo-tsukiji",
    slug: "tsukiji-outer-market",
    name: "Tsukiji Outer Market",
    destination: "Tokyo",
    destinationSlug: "tokyo",
    category: "food",
    priceLevel: "moderate",
    rating: 4.7,
    reviewCount: 2800,
    address: "Chuo City, Tokyo",
    coordinates: { latitude: 35.6655, longitude: 139.7708 },
    tags: ["Seafood", "Street Food"],
    matchScore: 89,
    rankPosition: 2,
    source: "place-provider",
  },
];

function makeContext(): TravelContext {
  return {
    requestId: "req_tokyo_1",
    destinationSlug: "tokyo",
    destination,
    user: {
      isAuthenticated: false,
      profilePreferences: {},
      urlPreferences: {},
      chatPreferences: {},
      resolvedPreferences: {
        styles: ["culture", "food"],
        budget: "balanced",
        group: "couple",
      },
      preferenceSource: "merged",
    },
    conversation: {
      turnIndex: 1,
      recentTurns: [{ id: "turn_1", role: "user", content: "Hi", createdAt: "2026-09-16T10:00:00Z" }],
    },
    query: {
      message: "Which culture spot should we visit?",
      normalizedMessage: "which culture spot should we visit?",
      intent: "recommend",
    },
    places: {
      candidatePlaces,
      selectedPlaceIds: [],
      candidateCount: 2,
    },
    grounding: {
      candidatePlaceIds: ["tokyo-sensoji", "tokyo-tsukiji"],
      selectedPlaceIds: [],
      rejectedPlaceIds: [],
      usedFallback: false,
    },
    provenance: {
      retrievedAt: "2026-09-16T10:00:00Z",
      destinationSource: "place-provider",
      requestSource: "api-route",
    },
  };
}

function makeTripAwareContext(issues?: TripPlanIssue[]): TravelContext {
  const trip: Trip = {
    id: "trip_1",
    userId: "user-a",
    title: "Tokyo Highlights",
    destinationSlug: "tokyo",
    destinationName: "Tokyo",
    description: null,
    startDate: "2026-11-01",
    endDate: "2026-11-03",
    status: "planning",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
  };
  const days: TripDay[] = [
    { id: "day_1", tripId: "trip_1", userId: "user-a", dayNumber: 1, date: "2026-11-01", createdAt: "2026-09-16T00:00:00.000Z" },
    { id: "day_2", tripId: "trip_1", userId: "user-a", dayNumber: 2, date: "2026-11-02", createdAt: "2026-09-16T00:00:00.000Z" },
    { id: "day_3", tripId: "trip_1", userId: "user-a", dayNumber: 3, date: "2026-11-03", createdAt: "2026-09-16T00:00:00.000Z" },
  ];
  const places: TripPlace[] = [
    {
      id: "place_1",
      tripId: "trip_1",
      userId: "user-a",
      placeId: "tokyo-sensoji",
      destinationSlug: "tokyo",
      placeName: "Senso-ji Temple",
      placeCategory: "culture",
      placeImageUrl: null,
      placeRating: 4.8,
      placePriceLevel: "budget",
      notes: null,
      sortOrder: 1,
      createdAt: "2026-09-16T00:00:00.000Z",
    },
  ];
  const items: ItineraryItem[] = [
    {
      id: "item_1",
      tripId: "trip_1",
      tripDayId: "day_1",
      userId: "user-a",
      placeId: "tokyo-sensoji",
      placeName: "Senso-ji Temple",
      placeCategory: "culture",
      placeImageUrl: null,
      startTime: "09:00",
      endTime: "11:00",
      notes: null,
      sortOrder: 1,
      createdAt: "2026-09-16T00:00:00.000Z",
    },
  ];
  const plan = buildTripPlan({ trip, days, places, items });
  const report = issues
    ? {
        tripId: trip.id,
        summary: {
          totalDays: 3,
          plannedDays: 1,
          emptyDays: 2,
          totalItems: 1,
          unassignedPlaceCount: 0,
          issueCount: issues.length,
        },
        issues,
      }
    : analyzeTripPlan(plan);

  return {
    ...makeContext(),
    trip: { tripId: trip.id, plan, report },
  };
}

describe("buildGeminiSystemInstruction", () => {
  it("includes strict grounding rules, matchScore explanation, and hallucination prohibition", () => {
    const instruction = buildGeminiSystemInstruction();
    assert.match(instruction, /CRITICAL GROUNDING AND ACCURACY RULES/i);
    assert.match(instruction, /NEVER invent places/i);
    assert.match(instruction, /matchScore/i);
    assert.match(instruction, /needsClarification/i);
    assert.match(instruction, /travel companion/i);
  });

  it("keeps the pre-existing rules 1-8 verbatim when decision support is added", () => {
    const instruction = buildGeminiSystemInstruction();
    const lines = instruction.split("\n");
    const rules = lines.filter((line) => /^\d+\./.test(line));

    // The original eight rules must still be present, unchanged and in order.
    assert.match(rules[0], /^1\. You MUST only make factual claims/);
    assert.match(rules[6], /^7\. You may reason about the supplied weather/);
    assert.match(rules[7], /^8\. NEVER invent weather conditions/);
    // New decision rules are appended after them.
    assert.match(rules[8], /^9\. When a `decisionContext` block is supplied/);
    assert.match(rules[9], /^10\. Only restate decision factors/);
  });

  it("tells the model the decision layer decides and the model only explains", () => {
    const instruction = buildGeminiSystemInstruction();
    assert.match(instruction, /DETERMINISTIC, already-computed recommendation/i);
    assert.match(instruction, /NEVER re-rank, reorder, re-score, contradict, or override/i);
    assert.match(instruction, /NEVER invent a factor or a reason that is not listed/i);
    assert.match(instruction, /missingSignals/i);
  });
});

describe("buildGeminiUserPrompt — decisionContext (Feature 20)", () => {
  function makeDecision(overrides = {}) {
    return buildTravelDecision({
      destinationSlug: "tokyo",
      destinationName: "Tokyo",
      candidatePlaces,
      preferences: { styles: ["culture"], budget: "balanced", group: "couple" },
      weather: makeWeatherContext(),
      scheduledPlaceIds: ["tokyo-sensoji"],
      ...overrides,
    });
  }

  it("omits the decisionContext block entirely when no decision is supplied", () => {
    const parsed = JSON.parse(buildGeminiUserPrompt(makeContext())) as Record<string, unknown>;
    assert.equal("decisionContext" in parsed, false);
  });

  it("produces a byte-identical prompt when decisionContext is absent or null", () => {
    const context = makeContext();
    const baseline = buildGeminiUserPrompt(context);
    assert.equal(buildGeminiUserPrompt(context, null), baseline);
    assert.equal(buildGeminiUserPrompt(context, undefined), baseline);
  });

  it("packages the deterministic ranking, scores, and decision factors", () => {
    const decision = makeDecision();
    const parsed = JSON.parse(buildGeminiUserPrompt(makeContext(), decision));
    const block = parsed.decisionContext;

    assert.equal(block.decisionSource, "deterministic_decision_layer");
    assert.equal(block.summary, decision.summary);
    assert.equal(block.rankedPlaces.length, decision.rankedPlaces.length);

    // The order and scores are passed through verbatim, never recomputed.
    assert.deepEqual(
      block.rankedPlaces.map((p: { placeId: string }) => p.placeId),
      decision.rankedPlaces.map((p) => p.placeId)
    );
    assert.deepEqual(
      block.rankedPlaces.map((p: { score: number }) => p.score),
      decision.rankedPlaces.map((p) => p.score)
    );
    assert.deepEqual(
      block.rankedPlaces.map((p: { rank: number }) => p.rank),
      decision.rankedPlaces.map((_, i) => i + 1)
    );
    assert.equal(block.primaryPlaceId, decision.primary?.placeId);
  });

  it("surfaces decision factors, signals used, and missing signals", () => {
    const decision = makeDecision();
    const block = JSON.parse(
      buildGeminiUserPrompt(makeContext(), decision)
    ).decisionContext;

    const factors = block.rankedPlaces.flatMap(
      (p: { decisionFactors: Array<{ kind: string; label: string }> }) => p.decisionFactors
    );
    assert.ok(factors.length > 0);
    for (const factor of factors) {
      assert.ok(factor.kind);
      assert.ok(factor.label);
    }
    // The exact deterministic factor kinds reach the prompt.
    const kinds = new Set(factors.map((f: { kind: string }) => f.kind));
    const decisionKinds = new Set(
      decision.rankedPlaces.flatMap((p) => p.factors.map((f) => f.kind))
    );
    assert.deepEqual([...kinds].sort(), [...decisionKinds].sort());

    assert.equal(block.signalsUsed.preferences, decision.usedPreferences);
    assert.equal(block.signalsUsed.weather, decision.usedWeather);
    assert.equal(block.signalsUsed.trip, decision.usedTrip);
    assert.equal(block.signalsUsed.savedPlaces, decision.usedSavedPlaces);
    assert.deepEqual(block.missingSignals, decision.missingSignals);
    assert.deepEqual(block.weatherFitPlaceIds, decision.weatherFitPlaceIds);
    assert.deepEqual(block.scheduledPlaceIds, decision.scheduledPlaceIds);
  });

  it("includes timing details when the traveller named a day", () => {
    const timing = parseRequestedTiming(
      "what should we do tomorrow?",
      "2026-09-16T10:00:00Z"
    );
    const decision = makeDecision({
      timing,
      weather: {
        ...makeWeatherContext(),
        forecast: [
          ...makeWeatherContext().forecast,
          {
            date: "2026-09-17",
            dayLabel: "Thursday",
            condition: "Clear",
            conditionCode: 0,
            highC: 24,
            lowC: 19,
            precipitationProbabilityPercent: 10,
          },
        ],
      },
    });
    const block = JSON.parse(
      buildGeminiUserPrompt(makeContext(), decision)
    ).decisionContext;

    assert.equal(decision.usedTiming, true);
    assert.equal(block.signalsUsed.timing, true);
    assert.equal(block.timing.requestedDate, "2026-09-17");
    assert.equal(block.timing.dateNamed, true);
  });

  it("marks missing signals so the model cannot invent absent context", () => {
    const decision = makeDecision({
      weather: null,
      scheduledPlaceIds: [],
      preferences: undefined,
    });
    const block = JSON.parse(
      buildGeminiUserPrompt(makeContext(), decision)
    ).decisionContext;

    assert.equal(block.signalsUsed.weather, false);
    assert.equal(block.signalsUsed.preferences, false);
    assert.deepEqual([...block.missingSignals].sort(), ["preferences", "trip", "weather"]);
  });

  it("caps the ranked places sent to the model at the top 3", () => {
    const manyPlaces: AssistantCandidatePlace[] = Array.from({ length: 5 }, (_, i) => ({
      ...candidatePlaces[0],
      placeId: `tokyo-place-${i + 1}`,
      name: `Place ${i + 1}`,
      matchScore: 95 - i,
    }));
    const decision = buildTravelDecision({
      destinationSlug: "tokyo",
      candidatePlaces: manyPlaces,
    });
    const block = JSON.parse(
      buildGeminiUserPrompt(makeContext(), decision)
    ).decisionContext;

    assert.equal(decision.rankedPlaces.length, 5);
    assert.equal(block.rankedPlaces.length, 3);
    // The kept ones are the actual top 3, in order.
    assert.deepEqual(
      block.rankedPlaces.map((p: { placeId: string }) => p.placeId),
      decision.rankedPlaces.slice(0, 3).map((p) => p.placeId)
    );
  });

  it("handles an empty deterministic decision without fabricating recommendations", () => {
    const decision = buildTravelDecision({
      destinationSlug: "tokyo",
      candidatePlaces: [],
    });
    const block = JSON.parse(
      buildGeminiUserPrompt(makeContext(), decision)
    ).decisionContext;

    assert.deepEqual(block.rankedPlaces, []);
    assert.equal(block.primaryPlaceId, null);
    assert.ok(block.summary.includes("Ranked 0 grounded places"));
  });

  it("labels the block as authoritative so the model cannot re-rank it", () => {
    const block = JSON.parse(
      buildGeminiUserPrompt(makeContext(), makeDecision())
    ).decisionContext;
    assert.match(block.authority, /already computed and authoritative/i);
    assert.match(block.authority, /Do NOT re-rank/i);
  });

  it("keeps every pre-existing prompt block alongside decisionContext", () => {
    const context = makeContext();
    context.trip = undefined;
    context.weather = makeWeatherContext();
    const parsed = JSON.parse(buildGeminiUserPrompt(context, makeDecision()));

    assert.equal(parsed.destinationContext.name, "Tokyo");
    assert.equal(parsed.groundedCandidatePlaces.length, 2);
    assert.deepEqual(parsed.travellerPreferences.styles, ["culture", "food"]);
    assert.ok(parsed.weatherContext);
    assert.ok(parsed.decisionContext);
    assert.equal(parsed.currentQuestion, "Which culture spot should we visit?");
  });
});

describe("buildGeminiUserPrompt", () => {
  it("packages destination context, preferences, candidate places with matchScores, and recent history", () => {
    const context = makeContext();
    const promptStr = buildGeminiUserPrompt(context);
    const parsed = JSON.parse(promptStr);

    assert.equal(parsed.destinationContext.name, "Tokyo");
    assert.deepEqual(parsed.travellerPreferences.styles, ["culture", "food"]);
    assert.equal(parsed.groundedCandidatePlaces.length, 2);
    assert.equal(parsed.groundedCandidatePlaces[0].placeId, "tokyo-sensoji");
    assert.equal(parsed.groundedCandidatePlaces[0].matchScore, 95);
    assert.equal(parsed.recentConversationHistory.length, 1);
    assert.equal(parsed.currentQuestion, "Which culture spot should we visit?");
  });

  it("omits the tripContext block when no trip context is supplied", () => {
    const context = makeContext();
    const promptStr = buildGeminiUserPrompt(context);
    const parsed = JSON.parse(promptStr) as Record<string, unknown>;

    assert.equal("tripContext" in parsed, false);
  });

  it("packages a bounded trip context block with plan facts and report issues", () => {
    const context = makeTripAwareContext();
    const promptStr = buildGeminiUserPrompt(context);
    const parsed = JSON.parse(promptStr);

    assert.equal(parsed.tripContext.tripId, "trip_1");
    assert.equal(parsed.tripContext.title, "Tokyo Highlights");
    assert.equal(parsed.tripContext.destinationSlug, "tokyo");
    assert.equal(parsed.tripContext.totalDays, 3);
    assert.equal(parsed.tripContext.plannedDays, 1);
    assert.equal(parsed.tripContext.totalItems, 1);
    assert.equal(parsed.tripContext.unassignedPlaceCount, 0);
    assert.equal(parsed.tripContext.report.summary.totalItems, 1);
    assert.equal(parsed.tripContext.report.issues.length, 2);
    assert.equal(parsed.tripContext.report.issues[0].dayNumber, 2);
    assert.equal(parsed.tripContext.report.issues[0].severity, "info");
    assert.equal("items" in parsed.tripContext, false);
    assert.equal(parsed.destinationContext.name, "Tokyo");
  });

  it("caps the number of report issues serialized into the prompt", () => {
    const issues: TripPlanIssue[] = Array.from({ length: 25 }).map((_, index) => ({
      code: "unassigned-place",
      severity: "info",
      message: `Unassigned place ${index + 1}`,
    }));
    const context = makeTripAwareContext(issues);
    const promptStr = buildGeminiUserPrompt(context);
    const parsed = JSON.parse(promptStr);

    assert.equal(parsed.tripContext.report.issues.length, 20);
    assert.equal(parsed.tripContext.report.summary.issueCount, 25);
  });
});

describe("buildGeminiUserPrompt weather context", () => {
  it("packages grounded weather context for a weather-aware question", () => {
    const base = makeContext();
    const context: TravelContext = {
      ...base,
      weather: makeWeatherContext(),
      query: {
        ...base.query,
        message: "Will it rain tomorrow in Tokyo?",
        normalizedMessage: "will it rain tomorrow in tokyo?",
      },
    };
    const promptStr = buildGeminiUserPrompt(context);
    const parsed = JSON.parse(promptStr) as Record<string, unknown>;
    const weatherContext = parsed.weatherContext as Record<string, unknown>;

    assert.equal(weatherContext.destinationSlug, "tokyo");
    assert.equal(weatherContext.destinationName, "Tokyo");
    assert.equal(weatherContext.weatherRelevance, "relevant");
    assert.equal(
      (weatherContext.current as { condition: string }).condition,
      "Light rain"
    );
    assert.equal(Array.isArray(weatherContext.forecast), true);
    assert.equal(typeof weatherContext.summary, "string");
    assert.match(weatherContext.summary as string, /Moderate rain/);
  });

  it("flags a non-weather question as weatherRelevance not_relevant", () => {
    const base = makeContext();
    const context: TravelContext = {
      ...base,
      weather: makeWeatherContext(),
      query: {
        ...base.query,
        message: "Which restaurant is best for dinner?",
        normalizedMessage: "which restaurant is best for dinner?",
      },
    };
    const promptStr = buildGeminiUserPrompt(context);
    const parsed = JSON.parse(promptStr) as Record<string, unknown>;
    assert.equal(
      (parsed.weatherContext as Record<string, unknown>).weatherRelevance,
      "not_relevant"
    );
  });

  it("omits the weatherContext block entirely when weather is unavailable (no fabrication)", () => {
    const context: TravelContext = { ...makeContext(), weather: null };
    const promptStr = buildGeminiUserPrompt(context);

    assert.equal(promptStr.includes("weatherContext"), false);
    assert.equal(promptStr.includes("Moderate rain"), false);

    const parsed = JSON.parse(promptStr) as Record<string, unknown>;
    assert.equal("weatherContext" in parsed, false);
    assert.equal(parsed.groundedCandidatePlaces !== undefined, true);
  });

  it("keeps every existing grounding block alongside weather context", () => {
    const context: TravelContext = { ...makeContext(), weather: makeWeatherContext() };
    const promptStr = buildGeminiUserPrompt(context);
    const parsed = JSON.parse(promptStr) as Record<string, unknown>;

    assert.equal((parsed.destinationContext as { name: string }).name, "Tokyo");
    assert.equal((parsed.travellerPreferences as { styles: string[] }).styles.length, 2);
    assert.equal((parsed.groundedCandidatePlaces as unknown[]).length, 2);
    assert.equal(parsed.currentQuestion, "Which culture spot should we visit?");
  });
});

describe("parseGeminiJsonResponse", () => {
  it("parses valid raw JSON properly", () => {
    const json = JSON.stringify({
      answer: "Senso-ji is an incredible cultural temple with a 95/100 match score.",
      referencedPlaceIds: ["tokyo-sensoji"],
      placeReasons: [{ placeId: "tokyo-sensoji", reason: "Top cultural match" }],
      needsClarification: false,
    });

    const result = parseGeminiJsonResponse(json);
    assert.equal(result.answer, "Senso-ji is an incredible cultural temple with a 95/100 match score.");
    assert.deepEqual(result.referencedPlaceIds, ["tokyo-sensoji"]);
    assert.equal(result.needsClarification, false);
    assert.equal(result.placeReasons?.length, 1);
  });

  it("handles markdown code fences in model output", () => {
    const fenced = "```json\n" + JSON.stringify({
      answer: "A great option is Senso-ji.",
      referencedPlaceIds: ["tokyo-sensoji"],
      needsClarification: false,
    }) + "\n```";

    const result = parseGeminiJsonResponse(fenced);
    assert.equal(result.answer, "A great option is Senso-ji.");
    assert.deepEqual(result.referencedPlaceIds, ["tokyo-sensoji"]);
  });

  it("throws for non-object or malformed input", () => {
    assert.throws(() => parseGeminiJsonResponse("not a json string"));
    assert.throws(() => parseGeminiJsonResponse("[]"));
  });
});

describe("buildGeminiGroundedResponse", () => {
  it("constructs an AssistantResponseEnvelope with matched place metadata", () => {
    const context = makeContext();
    const envelope = buildGeminiGroundedResponse({
      context,
      geminiPayload: {
        answer: "Start with Senso-ji Temple for a 95/100 match.",
        referencedPlaceIds: ["tokyo-sensoji"],
        placeReasons: [{ placeId: "tokyo-sensoji", reason: "Historic Buddhist temple matching your culture style" }],
        needsClarification: false,
      },
      createdAt: "2026-09-16T10:00:00Z",
    });

    assert.equal(envelope.destinationSlug, "tokyo");
    assert.equal(envelope.referencedPlaces.length, 1);
    assert.equal(envelope.referencedPlaces[0].placeId, "tokyo-sensoji");
    assert.equal(envelope.referencedPlaces[0].name, "Senso-ji Temple");
    assert.equal(envelope.referencedPlaces[0].matchScore, 95);
    assert.equal(envelope.primaryPlaceId, "tokyo-sensoji");
    assert.equal(envelope.mapFocusPlaceId, "tokyo-sensoji");
    assert.equal(envelope.assistantTurn.metadata?.grounded, true);
  });

  it("triggers clarification fallback if model returns an ungrounded/unknown place ID", () => {
    const context = makeContext();
    const envelope = buildGeminiGroundedResponse({
      context,
      geminiPayload: {
        answer: "Visit Fictional Kyoto Shrine.",
        referencedPlaceIds: ["fictional-kyoto-shrine"],
        needsClarification: false,
      },
      createdAt: "2026-09-16T10:00:00Z",
    });

    assert.equal(envelope.needsClarification, true);
    assert.equal(envelope.referencedPlaces.length, 0);
    assert.deepEqual(envelope.grounding.rejectedPlaceIds, ["fictional-kyoto-shrine"]);
    assert.match(envelope.answer, /safely ground/i);
  });
});

describe("callGeminiForTravel — 503 UNAVAILABLE retry (Feature 20)", () => {
  const VALID_TEXT = JSON.stringify({
    answer: "Start with Senso-ji Temple.",
    referencedPlaceIds: ["tokyo-sensoji"],
    needsClarification: false,
  });

  /** Builds an error shaped like a Gemini/GoogleGenAI 503 overload failure. */
  function unavailableError(message = "503 UNAVAILABLE: The model is overloaded."): Error {
    const error = new Error(message);
    Object.assign(error, { status: 503, code: 503 });
    return error;
  }

  beforeEach(() => {
    // Zero-delay backoff so the retry logic is tested without real timers.
    setGeminiRetryDelaysForTesting([0, 0]);
  });

  afterEach(() => {
    setGeminiClientForTesting(null);
    setGeminiRetryDelaysForTesting(null);
  });

  it("retries and succeeds when a 503 clears on the second attempt", async () => {
    const seen: unknown[] = [];
    let attempt = 0;

    setGeminiClientForTesting({
      models: {
        generateContent: async (params) => {
          seen.push(params);
          attempt += 1;
          if (attempt === 1) {
            throw unavailableError();
          }
          return { text: VALID_TEXT };
        },
      },
    });

    const payload = await callGeminiForTravel(makeContext(), "test-key");

    assert.equal(attempt, 2, "expected exactly 2 attempts");
    assert.equal(payload.answer, "Start with Senso-ji Temple.");
    assert.deepEqual(payload.referencedPlaceIds, ["tokyo-sensoji"]);
    // The retried request must be byte-identical to the original.
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0], seen[1]);
  });

  it("gives up after 3 total attempts when the 503 persists", async () => {
    let attempt = 0;
    setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          attempt += 1;
          throw unavailableError();
        },
      },
    });

    await assert.rejects(
      () => callGeminiForTravel(makeContext(), "test-key"),
      /overloaded/i
    );

    assert.equal(attempt, 3, "expected 1 initial attempt + 2 retries");
  });

  it("does not retry non-503 errors", async () => {
    const nonRetryable: Array<[string, unknown]> = [
      ["400 BadRequest", Object.assign(new Error("400 Bad Request: malformed"), { status: 400 })],
      ["401 Unauthorized", Object.assign(new Error("401 Unauthorized"), { status: 401 })],
      ["403 Forbidden", Object.assign(new Error("403 Forbidden"), { status: 403 })],
      ["404 NotFound", Object.assign(new Error("404 Not Found: model"), { status: 404 })],
      ["429 RateLimit", Object.assign(new Error("429 Too Many Requests"), { status: 429 })],
      ["500 Internal", Object.assign(new Error("500 Internal error"), { status: 500 })],
      ["plain Error", new Error("Empty response returned by Gemini API")],
    ];

    for (const [label, error] of nonRetryable) {
      let attempt = 0;
      setGeminiClientForTesting({
        models: {
          generateContent: async () => {
            attempt += 1;
            throw error;
          },
        },
      });

      await assert.rejects(
        () => callGeminiForTravel(makeContext(), "test-key"),
        (thrown: unknown) => thrown === error,
        `expected ${label} to reject`
      );
      assert.equal(attempt, 1, `expected ${label} to be called exactly once`);
    }
  });

  it("propagates the original error unchanged after exhausting retries", async () => {
    const original = unavailableError("503 UNAVAILABLE: still overloaded");
    setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          throw original;
        },
      },
    });

    await assert.rejects(
      () => callGeminiForTravel(makeContext(), "test-key"),
      (error: unknown) => error === original
    );
  });

  it("recovers on the third attempt when the first two fail", async () => {
    let attempt = 0;
    setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          attempt += 1;
          if (attempt <= 2) {
            throw unavailableError();
          }
          return { text: VALID_TEXT };
        },
      },
    });

    const payload = await callGeminiForTravel(makeContext(), "test-key");

    assert.equal(attempt, 3);
    assert.equal(payload.referencedPlaceIds[0], "tokyo-sensoji");
  });

  it("retries when the failure is reported as a UNAVAILABLE status string", async () => {
    let attempt = 0;
    setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          attempt += 1;
          if (attempt === 1) {
            throw Object.assign(new Error("The service is currently unavailable."), {
              status: "UNAVAILABLE",
            });
          }
          return { text: VALID_TEXT };
        },
      },
    });

    const payload = await callGeminiForTravel(makeContext(), "test-key");

    assert.equal(attempt, 2);
    assert.equal(payload.needsClarification, false);
  });
});

describe("isRetryableGeminiError", () => {
  it("treats explicit 503 / UNAVAILABLE shapes as retryable", () => {
    assert.equal(isRetryableGeminiError(Object.assign(new Error("x"), { status: 503 })), true);
    assert.equal(isRetryableGeminiError(Object.assign(new Error("x"), { code: 503 })), true);
    assert.equal(isRetryableGeminiError(Object.assign(new Error("x"), { status: "503" })), true);
    assert.equal(
      isRetryableGeminiError(Object.assign(new Error("x"), { status: "UNAVAILABLE" })),
      true
    );
    assert.equal(
      isRetryableGeminiError(
        Object.assign(new Error("x"), { code: "unavailable" })
      ),
      true
    );
    assert.equal(
      isRetryableGeminiError(new Error("503 Service Unavailable, please try again later")),
      true
    );
  });

  it("treats everything else as non-retryable", () => {
    assert.equal(isRetryableGeminiError(Object.assign(new Error("x"), { status: 400 })), false);
    assert.equal(isRetryableGeminiError(Object.assign(new Error("x"), { status: 401 })), false);
    assert.equal(isRetryableGeminiError(Object.assign(new Error("x"), { status: 403 })), false);
    assert.equal(isRetryableGeminiError(Object.assign(new Error("x"), { status: 404 })), false);
    assert.equal(isRetryableGeminiError(Object.assign(new Error("x"), { status: 429 })), false);
    // A 503 mention without a transient-capacity phrase is not enough.
    assert.equal(isRetryableGeminiError(new Error("Invalid 503 field in request")), false);
    assert.equal(isRetryableGeminiError(new Error("Empty response returned by Gemini API")), false);
    assert.equal(isRetryableGeminiError(null), false);
    assert.equal(isRetryableGeminiError(undefined), false);
    assert.equal(isRetryableGeminiError("503 UNAVAILABLE"), false, "non-object errors are ignored");
  });
});
