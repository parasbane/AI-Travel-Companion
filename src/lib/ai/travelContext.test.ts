import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DestinationInfo } from "@/lib/places/types";
import { buildTripPlan } from "@/lib/saved/tripPlan";
import { analyzeTripPlan } from "@/lib/saved/tripPlanReport";
import type { ItineraryItem, Trip, TripDay, TripPlace } from "@/lib/saved/types";
import { buildTravelContext, normalizeAssistantTurns, normalizeDestinationSlug, resolveAssistantPreferences } from "./travelContext";
import type { AssistantCandidatePlace, AssistantGroundingState } from "./types";
import type { AiWeatherContext } from "./weatherContext";

const destination: DestinationInfo = {
  slug: "goa",
  name: "Goa",
  country: "India",
  description: "Beach destination",
  bestTimeToVisit: "November to March",
  coordinates: { latitude: 15.2993, longitude: 74.124 },
  heroImageUrl: "https://example.com/goa.jpg",
  popularCategories: ["relaxation"],
  totalPlaces: 1,
};

const candidatePlaces: AssistantCandidatePlace[] = [
  {
    placeId: "goa-palolem",
    slug: "palolem-beach",
    name: "Palolem Beach",
    destination: "Goa",
    destinationSlug: "goa",
    category: "relaxation",
    priceLevel: "budget",
    rating: 4.7,
    reviewCount: 100,
    address: "South Goa",
    coordinates: { latitude: 15, longitude: 74 },
    tags: ["Beach"],
    matchScore: 88,
    rankPosition: 1,
    source: "place-provider",
  },
];

const grounding: AssistantGroundingState = {
  candidatePlaceIds: ["goa-palolem"],
  selectedPlaceIds: ["goa-palolem"],
  rejectedPlaceIds: [],
  usedFallback: false,
};

describe("normalizeDestinationSlug", () => {
  it("normalizes whitespace and commas", () => {
    assert.equal(normalizeDestinationSlug(" Goa, India "), "goa");
  });
});

describe("resolveAssistantPreferences", () => {
  it("resolves profile, URL, and chat preferences with deterministic precedence", () => {
    const resolution = resolveAssistantPreferences({
      profilePreferences: {
        styles: ["culture"],
        budget: "budget",
        group: "family",
      },
      urlPreferences: {
        styles: ["nature"],
        budget: "balanced",
      },
      chatPreferences: {
        styles: ["food"],
      },
    });

    assert.deepEqual(resolution.resolvedPreferences, {
      styles: ["food"],
      budget: "balanced",
      group: "family",
    });
    assert.equal(resolution.preferenceSource, "merged");
    assert.equal(resolution.usedProfile, true);
    assert.equal(resolution.usedUrl, true);
    assert.equal(resolution.usedChat, true);
  });

  it("preserves partial values independently when chat only supplies one field", () => {
    const resolution = resolveAssistantPreferences({
      profilePreferences: {
        styles: ["culture"],
        budget: "budget",
        group: "family",
      },
      chatPreferences: {
        styles: ["food"],
      },
    });

    assert.deepEqual(resolution.resolvedPreferences, {
      styles: ["food"],
      budget: "budget",
      group: "family",
    });
  });
});

describe("normalizeAssistantTurns", () => {
  it("trims content and keeps only the most recent bounded turns", () => {
    const turns = Array.from({ length: 8 }).map((_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `  turn ${index + 1}  `,
      createdAt: `2026-09-11T00:0${index}:00.000Z`,
    }));

    const normalized = normalizeAssistantTurns(turns, "2026-09-11T12:00:00.000Z");

    assert.equal(normalized.length, 6);
    assert.equal(normalized[0].content, "turn 3");
    assert.equal(normalized[0].id, "turn_1");
  });
});

describe("buildTravelContext", () => {
  it("builds a normalized assistant context with grounded candidates", () => {
    const context = buildTravelContext({
      requestId: "req_123",
      destinationSlug: " Goa ",
      destination,
      message: "  Which place should we visit tomorrow morning?  ",
      recentTurns: [
        { role: "user", content: "  Hi  " },
        { role: "assistant", content: " Hello ", metadata: { grounded: true } },
      ],
      preferenceResolution: resolveAssistantPreferences({
        profilePreferences: { budget: "budget" },
        chatPreferences: { styles: ["relaxation"] },
      }),
      candidatePlaces,
      grounding,
      selectedPlaceIds: ["goa-palolem"],
      nowIso: "2026-09-11T12:00:00.000Z",
    });

    assert.equal(context.destinationSlug, "goa");
    assert.equal(context.query.normalizedMessage, "Which place should we visit tomorrow morning?");
    assert.equal(context.query.intent, "recommend");
    assert.equal(context.places.candidateCount, 1);
    assert.deepEqual(context.places.selectedPlaceIds, ["goa-palolem"]);
    assert.equal(context.user.resolvedPreferences.budget, "budget");
    assert.deepEqual(context.user.resolvedPreferences.styles, ["relaxation"]);
  });

  it("leaves trip context unset when no trip plan is supplied", () => {
    const context = buildTravelContext({
      requestId: "req_124",
      destinationSlug: "goa",
      destination,
      message: "What should we do on day one?",
      preferenceResolution: resolveAssistantPreferences({}),
      candidatePlaces,
      grounding,
      nowIso: "2026-09-11T12:00:00.000Z",
    });

    assert.equal(context.trip, undefined);
  });

  it("attaches tripId, plan, and report without mutating the supplied snapshots", () => {
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
      createdAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
    };
    const days: TripDay[] = [
      { id: "day_1", tripId: "trip_1", userId: "user-a", dayNumber: 1, date: "2026-11-01", createdAt: "2026-09-11T00:00:00.000Z" },
      { id: "day_2", tripId: "trip_1", userId: "user-a", dayNumber: 2, date: "2026-11-02", createdAt: "2026-09-11T00:00:00.000Z" },
      { id: "day_3", tripId: "trip_1", userId: "user-a", dayNumber: 3, date: "2026-11-03", createdAt: "2026-09-11T00:00:00.000Z" },
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
        createdAt: "2026-09-11T00:00:00.000Z",
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
        createdAt: "2026-09-11T00:00:00.000Z",
      },
    ];
    const tripPlan = buildTripPlan({ trip, days, places, items });
    const tripPlanReport = analyzeTripPlan(tripPlan);
    const planSnapshot = structuredClone(tripPlan);
    const reportSnapshot = structuredClone(tripPlanReport);

    const context = buildTravelContext({
      requestId: "req_125",
      destinationSlug: "tokyo",
      destination,
      message: "What should we do on day one?",
      preferenceResolution: resolveAssistantPreferences({}),
      candidatePlaces,
      grounding,
      nowIso: "2026-09-11T12:00:00.000Z",
      tripId: "trip_1",
      tripPlan,
      tripPlanReport,
    });

    assert.equal(context.trip?.tripId, "trip_1");
    assert.equal(context.trip?.plan?.trip.id, "trip_1");
    assert.equal(context.trip?.plan?.totalItems, 1);
    assert.equal(context.trip?.report?.summary.issueCount, tripPlanReport.summary.issueCount);
    assert.deepEqual(context.trip?.plan, tripPlan);
    assert.deepEqual(context.trip?.report, tripPlanReport);
    assert.equal(context.weather, null);

    assert.deepEqual(tripPlan, planSnapshot);
    assert.deepEqual(tripPlanReport, reportSnapshot);
  });

  it("passes grounded weather context through unchanged and keeps it optional", () => {
    const weather: AiWeatherContext = {
      destinationSlug: "tokyo",
      destinationName: "Tokyo",
      retrievedAt: "2026-09-11T12:00:00.000Z",
      current: {
        condition: "Light rain",
        conditionCode: 61,
        temperatureC: 25,
        apparentTemperatureC: 28,
        observedAt: "2026-09-11T10:00:00Z",
      },
      forecast: [
        {
          date: "2026-09-11",
          dayLabel: "Friday",
          condition: "Light rain",
          conditionCode: 61,
          highC: 27,
          lowC: 24,
          precipitationProbabilityPercent: 80,
        },
      ],
      summary: "In Tokyo: Currently Light rain at 25°C.",
    };

    const context = buildTravelContext({
      requestId: "req_weather_1",
      destinationSlug: "tokyo",
      destination,
      message: "Plan a rainy day for this trip",
      preferenceResolution: resolveAssistantPreferences({}),
      candidatePlaces,
      grounding,
      nowIso: "2026-09-11T12:00:00.000Z",
      weather,
    });

    assert.deepEqual(context.weather, weather);
    assert.deepEqual(context.weather?.forecast, weather.forecast);
    assert.deepEqual(context.places.selectedPlaceIds, ["goa-palolem"]);
  });

  it("never fabricates weather — context is null when none is supplied", () => {
    const context = buildTravelContext({
      requestId: "req_weather_2",
      destinationSlug: "goa",
      destination,
      message: "What should we visit?",
      preferenceResolution: resolveAssistantPreferences({}),
      candidatePlaces,
      grounding,
      nowIso: "2026-09-11T12:00:00.000Z",
    });

    assert.equal(context.weather, null);
  });
});
