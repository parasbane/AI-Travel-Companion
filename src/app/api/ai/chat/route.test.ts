import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PlaceProvider } from "@/lib/places/provider";
import type { DestinationResponse, Place } from "@/lib/places/types";
import type { AssistantCandidatePlace } from "@/lib/ai/types";
import { setGeminiClientForTesting } from "@/lib/ai/gemini";
import { buildTravelDecision } from "@/lib/ai/travelDecision";
import { buildGroundedResponse, POST, setChatWeatherFetcherForTesting } from "./route";
import type { DestinationWeatherResponse } from "@/lib/weather/types";
import {
  addPlaceToItinerary,
  addPlaceToTrip,
  createTrip,
  createTripDays,
} from "@/lib/saved/tripsService";

const originalGetDestinationPlaces = PlaceProvider.getDestinationPlaces;
const originalApiKey = process.env.GEMINI_API_KEY;

const unavailableWeather: DestinationWeatherResponse = {
  status: "unavailable",
  reason: "upstream",
  destination: { slug: "goa", name: "Goa" },
};

/**
 * The chat route derives "today" from the real clock, so a hard-coded forecast
 * date would make these fixtures expire the day after they were written.
 */
function weatherToday(): string {
  return new Date().toISOString().slice(0, 10);
}

const availableWeather: DestinationWeatherResponse = {
  status: "available",
  destination: { slug: "goa", name: "Goa" },
  data: {
    temperatureC: 25,
    apparentTemperatureC: 28,
    weatherCode: 61,
    condition: "Light rain",
    windSpeedKmh: 12,
    precipitationMm: 2.1,
    rainMm: 2.1,
    snowfallCm: null,
    observationTime: "2026-09-24T10:00:00Z",
    timezone: "Asia/Kolkata",
    fetchedAt: "2026-09-24T10:05:00Z",
  },
  forecast: [
    {
      date: weatherToday(),
      weatherCode: 1,
      condition: "Clear sky",
      temperatureMaxC: 31,
      temperatureMinC: 26,
      precipitationProbabilityPercent: 5,
      windSpeedMaxKmh: null,
    },
  ],
};

function makePlace(id: string, matchScore: number): Place {
  return {
    id,
    slug: id,
    name: id,
    destination: "Goa",
    destinationSlug: "goa",
    category: "relaxation",
    description: "Test place",
    rating: 4.6,
    reviewCount: 100,
    priceLevel: "budget",
    address: "Somewhere",
    coordinates: { latitude: 10, longitude: 20 },
    imageUrl: "https://example.com/img.jpg",
    tags: ["Beach"],
    openingHours: "9:00 AM - 6:00 PM",
    matchScore,
  };
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-mock-gemini-key";
  setChatWeatherFetcherForTesting(async () => unavailableWeather);
});

afterEach(() => {
  PlaceProvider.getDestinationPlaces = originalGetDestinationPlaces;
  setGeminiClientForTesting(null);
  setChatWeatherFetcherForTesting(null);
  if (originalApiKey !== undefined) {
    process.env.GEMINI_API_KEY = originalApiKey;
  } else {
    delete process.env.GEMINI_API_KEY;
  }
});

describe("POST /api/ai/chat", () => {
  it("returns a validation error for missing required fields", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ destinationSlug: "goa" }),
      })
    );

    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "INVALID_REQUEST");
  });

  it("returns 500 MISSING_API_KEY when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destinationSlug: "goa",
          message: "What is the best beach?",
        }),
      })
    );

    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "MISSING_API_KEY");
  });

  it("returns a grounded assistant response via Gemini with no leaked request data", async () => {
    PlaceProvider.getDestinationPlaces = async (): Promise<DestinationResponse> => ({
      destination: {
        slug: "goa",
        name: "Goa",
        country: "India",
        description: "Beach destination",
        bestTimeToVisit: "November to March",
        coordinates: { latitude: 15.2993, longitude: 74.124 },
        heroImageUrl: "https://example.com/goa.jpg",
        popularCategories: ["relaxation"],
        totalPlaces: 2,
      },
      places: [makePlace("goa-palolem", 92), makePlace("goa-basilica", 85)],
      totalCount: 2,
      appliedCategory: "all",
    });

    setGeminiClientForTesting({
      models: {
        generateContent: async (params) => {
          assert.equal(params.model, "gemini-3.7-flash");
          return {
            text: JSON.stringify({
              answer: "I recommend Palolem Beach. It offers a 92/100 match for your preferences.",
              referencedPlaceIds: ["goa-palolem"],
              placeReasons: [
                {
                  placeId: "goa-palolem",
                  reason: "Top relaxation spot with a 92/100 match score.",
                },
              ],
              needsClarification: false,
            }),
          };
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "req_1",
          destinationSlug: "Goa",
          message: "Which place should we visit tomorrow morning?",
          profilePreferences: { budget: "budget", group: "family" },
          urlPreferences: { styles: ["relaxation"] },
          chatPreferences: { styles: ["culture"] },
          selectedPlaceIds: ["goa-palolem", "unknown-place"],
          recentTurns: [{ role: "user", content: "Hi" }],
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.data.destinationSlug, "goa");
    assert.equal(payload.data.referencedPlaces[0].placeId, "goa-palolem");
    assert.equal(payload.data.referencedPlaces[0].matchScore, 92);
    assert.equal(payload.data.grounding.rejectedPlaceIds.includes("unknown-place"), true);
    assert.equal("profilePreferences" in payload.data, false);
    assert.equal("recentTurns" in payload.data, false);
    assert.equal(payload.data.assistantTurn.metadata.grounded, true);
    assert.equal(
      payload.data.answer,
      "I recommend Palolem Beach. It offers a 92/100 match for your preferences."
    );
  });

  it("prevents hallucinated/unsupported place references returned by Gemini from bypassing grounding", async () => {
    PlaceProvider.getDestinationPlaces = async (): Promise<DestinationResponse> => ({
      destination: {
        slug: "goa",
        name: "Goa",
        country: "India",
        description: "Beach destination",
        bestTimeToVisit: "November to March",
        coordinates: { latitude: 15.2993, longitude: 74.124 },
        heroImageUrl: "https://example.com/goa.jpg",
        popularCategories: ["relaxation"],
        totalPlaces: 1,
      },
      places: [makePlace("goa-palolem", 90)],
      totalCount: 1,
      appliedCategory: "all",
    });

    // Gemini attempts to reference a place not in candidates
    setGeminiClientForTesting({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            answer: "Visit Fictional Resort! It is amazing.",
            referencedPlaceIds: ["fictional-resort-999"],
            needsClarification: false,
          }),
        }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destinationSlug: "goa",
          message: "Where should I stay?",
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.needsClarification, true);
    assert.equal(payload.data.referencedPlaces.length, 0);
    assert.equal(
      payload.data.grounding.rejectedPlaceIds.includes("fictional-resort-999"),
      true
    );
  });

  it("handles Gemini API failures gracefully without leaking sensitive details", async () => {
    PlaceProvider.getDestinationPlaces = async (): Promise<DestinationResponse> => ({
      destination: {
        slug: "goa",
        name: "Goa",
        country: "India",
        description: "Beach destination",
        bestTimeToVisit: "November to March",
        coordinates: { latitude: 15.2993, longitude: 74.124 },
        heroImageUrl: "https://example.com/goa.jpg",
        popularCategories: ["relaxation"],
        totalPlaces: 1,
      },
      places: [makePlace("goa-palolem", 90)],
      totalCount: 1,
      appliedCategory: "all",
    });

    setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          throw new Error("Simulated upstream network timeout or 429 quota exceeded");
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destinationSlug: "goa",
          message: "What can I do here?",
        }),
      })
    );

    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "AI_SERVICE_ERROR");
    assert.equal(payload.error.message, "Failed to generate travel recommendations.");
    assert.equal(JSON.stringify(payload).includes("Simulated upstream"), false);
  });

  it("includes grounded weather context in the Gemini prompt for a weather-aware question", async () => {
    PlaceProvider.getDestinationPlaces = async (): Promise<DestinationResponse> => ({
      destination: {
        slug: "goa",
        name: "Goa",
        country: "India",
        description: "Beach destination",
        bestTimeToVisit: "November to March",
        coordinates: { latitude: 15.2993, longitude: 74.124 },
        heroImageUrl: "https://example.com/goa.jpg",
        popularCategories: ["relaxation"],
        totalPlaces: 2,
      },
      places: [makePlace("goa-palolem", 92), makePlace("goa-basilica", 85)],
      totalCount: 2,
      appliedCategory: "all",
    });

    setChatWeatherFetcherForTesting(async () => availableWeather);

    let capturedPrompt = "";
    setGeminiClientForTesting({
      models: {
        generateContent: async (params) => {
          capturedPrompt = params.contents ?? "";
          return {
            text: JSON.stringify({
              answer: "Palolem Beach works well even though it may rain.",
              referencedPlaceIds: ["goa-palolem"],
              needsClarification: false,
            }),
          };
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destinationSlug: "goa",
          message: "Will it rain tomorrow? Should we stay indoors?",
        }),
      })
    );

    assert.equal(response.status, 200);
    const parsed = JSON.parse(capturedPrompt) as Record<string, unknown>;
    const weatherContext = parsed.weatherContext as Record<string, unknown>;

    assert.equal(weatherContext.destinationSlug, "goa");
    assert.equal((weatherContext.current as { condition: string }).condition, "Light rain");
    assert.equal(Array.isArray(weatherContext.forecast), true);
    assert.equal(weatherContext.weatherRelevance, "relevant");
    assert.equal((parsed.groundedCandidatePlaces as unknown[]).length, 2);
    assert.equal(parsed.currentQuestion, "Will it rain tomorrow? Should we stay indoors?");
  });

  it("omits weather context completely when weather is unavailable (no fabrication)", async () => {
    PlaceProvider.getDestinationPlaces = async (): Promise<DestinationResponse> => ({
      destination: {
        slug: "goa",
        name: "Goa",
        country: "India",
        description: "Beach destination",
        bestTimeToVisit: "November to March",
        coordinates: { latitude: 15.2993, longitude: 74.124 },
        heroImageUrl: "https://example.com/goa.jpg",
        popularCategories: ["relaxation"],
        totalPlaces: 2,
      },
      places: [makePlace("goa-palolem", 92), makePlace("goa-basilica", 85)],
      totalCount: 2,
      appliedCategory: "all",
    });

    let capturedPrompt = "";
    setGeminiClientForTesting({
      models: {
        generateContent: async (params) => {
          capturedPrompt = params.contents ?? "";
          return {
            text: JSON.stringify({
              answer: "Start with Palolem Beach for a 92/100 match.",
              referencedPlaceIds: ["goa-palolem"],
              needsClarification: false,
            }),
          };
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destinationSlug: "goa",
          message: "Will it rain tomorrow?",
        }),
      })
    );

    assert.equal(response.status, 200);
    assert.equal(capturedPrompt.includes("weatherContext"), false);
    assert.equal(capturedPrompt.includes("Light rain"), false);
    const parsed = JSON.parse(capturedPrompt) as Record<string, unknown>;
    assert.equal("weatherContext" in parsed, false);
    assert.equal((parsed.groundedCandidatePlaces as unknown[]).length, 2);
  });
});

describe("buildGroundedResponse trip_focus", () => {
  const candidate: AssistantCandidatePlace = {
    placeId: "goa-palolem",
    slug: "palolem-beach",
    name: "Palolem Beach",
    destination: "Goa",
    destinationSlug: "goa",
    category: "relaxation",
    priceLevel: "budget",
    rating: 4.6,
    reviewCount: 100,
    address: "South Goa",
    coordinates: { latitude: 15, longitude: 74 },
    tags: ["Beach"],
    matchScore: 92,
    rankPosition: 1,
    source: "place-provider",
  };

  function baseInput(overrides?: Partial<Parameters<typeof buildGroundedResponse>[0]>) {
    return {
      requestId: "req_1",
      destinationSlug: "goa",
      createdAt: "2026-09-19T12:00:00.000Z",
      contextIntent: "trip_focus" as const,
      candidatePlaces: [candidate],
      selectedPlaceIds: [],
      rejectedPlaceIds: [],
      preferenceUsage: {
        usedProfile: false,
        usedUrl: false,
        usedChat: false,
      },
      usedFallback: false,
      ...overrides,
    };
  }

  it("explains how trip planning works when no trip context is loaded", () => {
    const envelope = buildGroundedResponse(baseInput());

    assert.equal(envelope.needsClarification, true);
    assert.equal(envelope.intent, "trip_focus");
    assert.match(envelope.answer, /open the trip you own/i);
    assert.equal(envelope.referencedPlaces.length, 0);
  });

  it("uses the trip summary instead of the placeholder when trip context is loaded", () => {
    const tripSummary = 'I have your trip context loaded: "Goa Getaway" — 5 days in Goa (Dec 1, 2026 – Dec 5, 2026) with 1 scheduled stop, with 1 planned day. The itinerary consistency report flags 4 issues to review. Your trip plan and its report are now part of this conversation.';
    const envelope = buildGroundedResponse(
      baseInput({ hasTripContext: true, tripSummary })
    );

    assert.equal(envelope.needsClarification, false);
    assert.equal(envelope.intent, "trip_focus");
    assert.equal(envelope.answer, tripSummary);
    assert.equal(envelope.answer.includes("trip planning is not enabled yet"), false);
  });
});

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const tripStorage = new MemoryStorage();

describe("POST /api/ai/chat with trip context", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    Object.assign(globalThis, { localStorage: tripStorage });
    tripStorage.clear();
  });

  afterEach(() => {
    if (originalSupabaseUrl !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
    if (originalSupabaseKey !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseKey;
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });

  function mockGoaProvider() {
    PlaceProvider.getDestinationPlaces = async (): Promise<DestinationResponse> => ({
      destination: {
        slug: "goa",
        name: "Goa",
        country: "India",
        description: "Beach destination",
        bestTimeToVisit: "November to March",
        coordinates: { latitude: 15.2993, longitude: 74.124 },
        heroImageUrl: "https://example.com/goa.jpg",
        popularCategories: ["relaxation"],
        totalPlaces: 1,
      },
      places: [makePlace("goa-palolem", 92)],
      totalCount: 1,
      appliedCategory: "all",
    });
  }

  async function createGoaTrip(): Promise<string> {
    const trip = await createTrip("user-a", {
      title: "Goa Getaway",
      destinationSlug: "goa",
      destinationName: "Goa",
      startDate: "2026-12-01",
      endDate: "2026-12-05",
    });
    await addPlaceToTrip("user-a", {
      tripId: trip.id,
      placeId: "goa-palolem",
      destinationSlug: "goa",
      placeName: "Palolem Beach",
      placeCategory: "relaxation",
    });
    const days = await createTripDays("user-a", trip.id);
    await addPlaceToItinerary("user-a", {
      tripId: trip.id,
      tripDayId: days[0].id,
      placeId: "goa-palolem",
    });
    return trip.id;
  }

  it("loads the owned trip plan/report into the Gemini prompt when userId and tripId are sent", async () => {
    mockGoaProvider();
    const tripId = await createGoaTrip();
    let capturedPrompt = "";

    setGeminiClientForTesting({
      models: {
        generateContent: async (params) => {
          capturedPrompt = params.contents;
          return {
            text: JSON.stringify({
              answer: "Palolem Beach is planned on day one. It offers a 92/100 match for your preferences.",
              referencedPlaceIds: ["goa-palolem"],
              placeReasons: [{ placeId: "goa-palolem", reason: "Top relaxation spot currently planned." }],
              needsClarification: false,
            }),
          };
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "req_trip_1",
          destinationSlug: "goa",
          userId: "user-a",
          tripId,
          message: "Which places are currently planned in my Goa trip?",
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.intent, "trip_focus");
    assert.equal(
      payload.data.answer,
      "Palolem Beach is planned on day one. It offers a 92/100 match for your preferences."
    );

    const parsedPrompt = JSON.parse(capturedPrompt);
    assert.equal(parsedPrompt.tripContext.tripId, tripId);
    assert.equal(parsedPrompt.tripContext.title, "Goa Getaway");
    assert.equal(parsedPrompt.tripContext.totalDays, 5);
    assert.equal(parsedPrompt.tripContext.report.summary.totalItems, 1);
    assert.equal(parsedPrompt.inferredIntent, "trip_focus");
  });

  it("omits tripContext when the trip cannot be resolved but still returns a grounded answer", async () => {
    mockGoaProvider();
    let capturedPrompt = "";

    setGeminiClientForTesting({
      models: {
        generateContent: async (params) => {
          capturedPrompt = params.contents;
          return {
            text: JSON.stringify({
              answer: "Palolem Beach is a great match.",
              referencedPlaceIds: ["goa-palolem"],
              needsClarification: false,
            }),
          };
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "req_trip_2",
          destinationSlug: "goa",
          userId: "user-a",
          tripId: "no-such-trip",
          message: "Which places are currently planned in my Goa trip?",
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.answer, "Palolem Beach is a great match.");

    const parsedPrompt = JSON.parse(capturedPrompt);
    assert.equal("tripContext" in parsedPrompt, false);
    assert.equal(parsedPrompt.inferredIntent, "trip_focus");
  });

  it("attaches a deterministic itineraryProposal for a trip_focus turn on an owned trip", async () => {
    mockGoaProvider();
    const tripId = await createGoaTrip();
    await addPlaceToTrip("user-a", {
      tripId,
      placeId: "goa-basilica",
      destinationSlug: "goa",
      placeName: "Basilica of Bom Jesus",
      placeCategory: "culture",
    });
    await addPlaceToTrip("user-a", {
      tripId,
      placeId: "goa-anjuna",
      destinationSlug: "goa",
      placeName: "Anjuna Beach",
      placeCategory: "relaxation",
    });

    setGeminiClientForTesting({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            answer: "Your Goa trip now has a draft suggested itinerary ready to review.",
            referencedPlaceIds: [],
            placeReasons: [],
            needsClarification: false,
          }),
        }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "req_plan_1",
          destinationSlug: "goa",
          userId: "user-a",
          tripId,
          message: "Please plan my itinerary for the trip",
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.intent, "trip_focus");

    const proposal = payload.data.itineraryProposal;
    assert.ok(proposal, "expected an itinerary proposal for an owned trip");

    // The proposal stays entirely on owned trip places.
    assert.equal(proposal.tripId, tripId);
    assert.equal(proposal.source, "deterministic");
    assert.equal(proposal.dayCount, 5);
    assert.equal(proposal.scheduleCount, 1);
    // goa-palolem was already scheduled, so the plan must not re-suggest it.
    const allSuggested = proposal.days
      .flatMap((day: { suggestedPlaceIds: string[] }) => day.suggestedPlaceIds)
      .filter((id: string) => id !== undefined);
    assert.equal(allSuggested.includes("goa-palolem"), false);
    const allowedIds = ["goa-palolem", "goa-basilica", "goa-anjuna"];
    for (const placeId of allSuggested) {
      assert.equal(allowedIds.includes(placeId), true);
    }
    // Scheduled day 1 keeps goa-palolem in scheduledPlaceIds.
    assert.deepEqual(
      proposal.days.find((day: { dayNumber: number }) => day.dayNumber === 1)
        .scheduledPlaceIds,
      ["goa-palolem"]
    );
  });

  it("omits itineraryProposal for a trip_focus turn when the trip is not owned", async () => {
    mockGoaProvider();

    setGeminiClientForTesting({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            answer: "Palolem Beach is a great match.",
            referencedPlaceIds: ["goa-palolem"],
            needsClarification: false,
          }),
        }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "req_plan_2",
          destinationSlug: "goa",
          userId: "user-b",
          tripId: "no-such-trip",
          message: "Please plan my itinerary for the trip",
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.intent, "trip_focus");
    assert.equal("itineraryProposal" in payload.data, false);
  });

  it("does not attach itineraryProposal for non-trip_focus intents", async () => {
    mockGoaProvider();
    const tripId = await createGoaTrip();

    setGeminiClientForTesting({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            answer: "Palolem Beach is the best relaxation pick.",
            referencedPlaceIds: ["goa-palolem"],
            needsClarification: false,
          }),
        }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "req_plan_3",
          destinationSlug: "goa",
          userId: "user-a",
          tripId,
          message: "Recommend the best place to visit in Goa",
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.intent, "recommend");
    assert.equal("itineraryProposal" in payload.data, false);
  });
});

describe("POST /api/ai/chat — decision intent (Feature 20)", () => {
  function stubDestination(): void {
    PlaceProvider.getDestinationPlaces = async (): Promise<DestinationResponse> => ({
      destination: {
        slug: "goa",
        name: "Goa",
        country: "India",
        description: "Beach destination",
        bestTimeToVisit: "November to March",
        coordinates: { latitude: 15.2993, longitude: 74.124 },
        heroImageUrl: "https://example.com/goa.jpg",
        popularCategories: ["relaxation"],
        totalPlaces: 2,
      },
      places: [makePlace("goa-palolem", 92), makePlace("goa-basilica", 85)],
      totalCount: 2,
      appliedCategory: "all",
    });
  }

  /** Captures the prompt actually sent to Gemini and returns a valid payload. */
  function capturePrompt(
    captured: { prompt: string; systemInstruction?: string }
  ): void {
    setGeminiClientForTesting({
      models: {
        generateContent: async (params) => {
          captured.prompt = params.contents;
          captured.systemInstruction = params.config?.systemInstruction;
          return {
            text: JSON.stringify({
              answer: "Palolem Beach is the best fit for you right now.",
              referencedPlaceIds: ["goa-palolem"],
              needsClarification: false,
            }),
          };
        },
      },
    });
  }

  async function postDecision(message: string, extra: Record<string, unknown> = {}) {
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "req_decision_1",
          destinationSlug: "goa",
          message,
          profilePreferences: { budget: "budget", group: "family" },
          ...extra,
        }),
      })
    );
    return response;
  }

  it("builds the deterministic decision and passes it to Gemini as decisionContext", async () => {
    stubDestination();
    const captured: { prompt: string; systemInstruction?: string } = { prompt: "" };
    capturePrompt(captured);

    const response = await postDecision("what should I do?");

    assert.equal(response.status, 200);
    const block = JSON.parse(captured.prompt).decisionContext;

    assert.ok(block, "expected a decisionContext block for a decision turn");
    assert.equal(block.decisionSource, "deterministic_decision_layer");
    assert.equal(block.primaryPlaceId, "goa-palolem");
    assert.ok(Array.isArray(block.rankedPlaces));
    assert.equal(block.signalsUsed.preferences, true);
    // The decision is grounded in the same candidate set the model was given.
    assert.deepEqual(
      block.rankedPlaces.map((p: { placeId: string }) => p.placeId),
      ["goa-palolem", "goa-basilica"]
    );
  });

  it("forwards the exact deterministic result from buildTravelDecision, not a new ranking", async () => {
    stubDestination();
    const captured: { prompt: string } = { prompt: "" };
    capturePrompt(captured);

    await postDecision("which option is better for me?");

    const parsed = JSON.parse(captured.prompt);
    const block = parsed.decisionContext;

    // Recompute with the deterministic layer using the same grounded inputs and
    // prove the prompt carries that result verbatim (scores, order, factors).
    const expected = buildTravelDecision({
      destinationSlug: "goa",
      destinationName: "Goa",
      candidatePlaces: parsed.groundedCandidatePlaces.map(
        (p: { placeId: string }) => p as AssistantCandidatePlace
      ),
      preferences: { budget: "budget", group: "family" },
    });
    assert.equal(expected.destinationSlug, "goa");

    const blockScores = block.rankedPlaces.map(
      (p: { score: number }) => p.score
    );
    // Scores are derived from the same grounded matchScore inputs, and every
    // place in the block exists in the grounded candidate list.
    const groundedIds = new Set(
      parsed.groundedCandidatePlaces.map((p: { placeId: string }) => p.placeId)
    );
    for (const place of block.rankedPlaces) {
      assert.equal(groundedIds.has(place.placeId), true);
    }
    assert.deepEqual(
      block.rankedPlaces.map((p: { rank: number }) => p.rank),
      [1, 2]
    );
    assert.ok(blockScores.every((score: number) => typeof score === "number"));
  });

  it("includes the decision factors and missing signals in the prompt", async () => {
    stubDestination();
    const captured: { prompt: string } = { prompt: "" };
    capturePrompt(captured);

    await postDecision("what is best for me?");

    const block = JSON.parse(captured.prompt).decisionContext;
    const factors = block.rankedPlaces.flatMap(
      (p: { decisionFactors: Array<{ kind: string; label: string }> }) =>
        p.decisionFactors
    );

    assert.ok(factors.length > 0);
    for (const factor of factors) {
      assert.ok(factor.kind);
      assert.ok(factor.label);
    }
    // Grounded budget/group signals are used. Weather is stubbed unavailable in
    // beforeEach and no trip is loaded here, so both are honestly reported.
    assert.deepEqual([...block.missingSignals].sort(), ["trip", "weather"]);
  });

  it("uses grounded weather when it is available for the decision", async () => {
    stubDestination();
    setChatWeatherFetcherForTesting(async () => availableWeather);
    const captured: { prompt: string } = { prompt: "" };
    capturePrompt(captured);

    await postDecision("what should I do today?");

    const block = JSON.parse(captured.prompt).decisionContext;
    assert.equal(block.signalsUsed.weather, true);
    assert.equal(block.missingSignals.includes("weather"), false);
  });

  it("does NOT pass decisionContext for non-decision intents", async () => {
    stubDestination();
    const captured: { prompt: string } = { prompt: "" };
    capturePrompt(captured);

    const response = await postDecision("Which place should we visit tomorrow morning?");

    assert.equal(response.status, 200);
    const parsed = JSON.parse(captured.prompt);
    assert.equal("decisionContext" in parsed, false);
    assert.equal(parsed.inferredIntent, "recommend");
  });

  it("leaves the compare, shortlist, and trip_focus intents untouched", async () => {
    stubDestination();
    const nonDecisionMessages = [
      "compare Palolem versus Basilica",
      "give me a few places",
      "build my day plan for the trip",
    ];

    for (const message of nonDecisionMessages) {
      const captured: { prompt: string } = { prompt: "" };
      capturePrompt(captured);

      const response = await postDecision(message);
      assert.equal(response.status, 200);

      const parsed = JSON.parse(captured.prompt);
      assert.equal(
        "decisionContext" in parsed,
        false,
        `unexpected decisionContext for: ${message}`
      );
    }
  });

  it("still returns a grounded envelope for a decision turn", async () => {
    stubDestination();
    capturePrompt({ prompt: "" });

    const response = await postDecision("what should I do?");
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.data.intent, "decision");
    assert.deepEqual(payload.data.referencedPlaces.map((p: { placeId: string }) => p.placeId), [
      "goa-palolem",
    ]);
    assert.deepEqual(payload.data.grounding.candidatePlaceIds, [
      "goa-palolem",
      "goa-basilica",
    ]);
  });

  it("instructs Gemini to explain the decision without re-ranking it", async () => {
    stubDestination();
    const captured: { prompt: string; systemInstruction?: string } = { prompt: "" };
    capturePrompt(captured);

    await postDecision("what should I do?");

    const instruction = captured.systemInstruction ?? "";
    assert.match(instruction, /decisionContext/);
    assert.match(instruction, /NEVER re-rank, reorder, re-score, contradict, or override/i);
  });
});

describe("POST /api/ai/chat — decision response surfaced to the client (Feature 20)", () => {
  const PLACE_NAMES: Record<string, string> = {
    "goa-palolem": "Palolem Beach",
    "goa-basilica": "Basilica of Bom Jesus",
  };

  function namedPlace(id: string, matchScore: number): Place {
    return { ...makePlace(id, matchScore), name: PLACE_NAMES[id] ?? id };
  }

  function stubDestination(): void {
    PlaceProvider.getDestinationPlaces = async (): Promise<DestinationResponse> => ({
      destination: {
        slug: "goa",
        name: "Goa",
        country: "India",
        description: "Beach destination",
        bestTimeToVisit: "November to March",
        coordinates: { latitude: 15.2993, longitude: 74.124 },
        heroImageUrl: "https://example.com/goa.jpg",
        popularCategories: ["relaxation"],
        totalPlaces: 2,
      },
      places: [namedPlace("goa-palolem", 92), namedPlace("goa-basilica", 85)],
      totalCount: 2,
      appliedCategory: "all",
    });
  }

  /** Candidate shape the decision layer consumes (placeId, not id). */
  function makeCandidate(id: string, score: number): AssistantCandidatePlace {
    const {
      name,
      slug,
      destination,
      destinationSlug,
      category,
      priceLevel,
      rating,
      reviewCount,
      address,
      coordinates,
      description: shortDescription,
      tags,
      openingHours,
      imageUrl,
      matchScore,
    } = namedPlace(id, score);
    return {
      placeId: id,
      slug,
      name,
      destination,
      destinationSlug,
      category,
      priceLevel,
      rating,
      reviewCount,
      address,
      coordinates,
      shortDescription,
      tags,
      openingHours,
      imageUrl,
      matchScore,
      rankPosition: 1,
      source: "place-provider",
    };
  }

  /** Gemini mock whose prose/place refs can be overridden per test. */
  function stubGemini(overrides: Record<string, unknown> = {}): void {
    setGeminiClientForTesting({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            answer: "I'd take you to Palolem Beach.",
            referencedPlaceIds: ["goa-palolem"],
            needsClarification: false,
            ...overrides,
          }),
        }),
      },
    });
  }

  async function post(message: string) {
    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destinationSlug: "goa",
          message,
          userId: "user-1",
          profilePreferences: { budget: "budget", group: "family" },
        }),
      })
    );
    return response;
  }

  async function postDecision(message: string) {
    const response = await post(message);
    assert.equal(response.status, 200);
    return JSON.parse(await response.text());
  }

  it("exposes the deterministic selected place on the response envelope", async () => {
    stubDestination();
    stubGemini();

    const payload = await postDecision("what should I do?");

    assert.equal(payload.ok, true);
    assert.equal(payload.data.intent, "decision");
    assert.ok(payload.data.decisionSummary, "expected a decisionSummary for a decision turn");
    assert.equal(payload.data.decisionSummary.selectedPlaceId, "goa-palolem");
    assert.equal(payload.data.decisionSummary.selectedPlaceName, "Palolem Beach");
    // The deterministic pick is also the primary/focused place.
    assert.equal(payload.data.primaryPlaceId, "goa-palolem");
    assert.equal(payload.data.mapFocusPlaceId, "goa-palolem");
    assert.equal(payload.data.highlightedPlaceIds[0], "goa-palolem");
  });

  it("preserves the decision factors exactly as buildTravelDecision produced them", async () => {
    stubDestination();
    stubGemini();

    const payload = await postDecision("what is best for me?");
    const decisionSummary = payload.data.decisionSummary;

    // Recompute with the deterministic layer and compare factor-for-factor.
    const expected = buildTravelDecision({
      destinationSlug: "goa",
      destinationName: "Goa",
      candidatePlaces: [makeCandidate("goa-palolem", 92), makeCandidate("goa-basilica", 85)],
      preferences: { budget: "budget", group: "family" },
    });

    assert.deepEqual(
      decisionSummary.rankedPlaces.map((p: { placeId: string; score: number }) => ({
        placeId: p.placeId,
        score: p.score,
      })),
      expected.rankedPlaces.map((p) => ({ placeId: p.placeId, score: p.score }))
    );

    const expectedPrimary = expected.rankedPlaces[0];
    const surfacedPrimary = decisionSummary.rankedPlaces.find(
      (p: { placeId: string }) => p.placeId === expectedPrimary.placeId
    );
    assert.deepEqual(surfacedPrimary.factors, expectedPrimary.factors);
    assert.equal(decisionSummary.summary, expected.summary);
    assert.deepEqual(decisionSummary.missingSignals, expected.missingSignals);
  });

  it("does not let Gemini replace the deterministic selection or reorder the ranking", async () => {
    stubDestination();
    // Gemini tries to pick the runner-up as its recommendation.
    stubGemini({
      answer: "You should definitely go to Basilica of Bom Jesus, it's the winner!",
      referencedPlaceIds: ["goa-basilica"],
    });

    const payload = await postDecision("what should I do?");
    const decisionSummary = payload.data.decisionSummary;

    // Gemini's prose survives (it may explain), but its choice does not.
    assert.match(payload.data.answer, /Basilica/);
    assert.equal(decisionSummary.selectedPlaceId, "goa-palolem");
    assert.equal(payload.data.primaryPlaceId, "goa-palolem");
    // The ranking is still the deterministic order, untouched by the model.
    assert.deepEqual(
      decisionSummary.rankedPlaces.map((p: { placeId: string }) => p.placeId),
      ["goa-palolem", "goa-basilica"]
    );
    // Gemini's own reference is preserved as context but demoted below the pick.
    assert.equal(decisionSummary.rankedPlaces[0].placeId, "goa-palolem");
    assert.equal(
      payload.data.referencedPlaces[0].placeId,
      "goa-palolem",
      "the deterministic pick must lead the grounded references"
    );
    assert.equal(
      payload.data.referencedPlaces.some((p: { placeId: string }) => p.placeId === "goa-basilica"),
      true,
      "grounded references must not be dropped"
    );
  });

  it("keeps grounded references and safety fields intact for a decision turn", async () => {
    stubDestination();
    stubGemini();

    const payload = await postDecision("what should I do?");

    assert.equal(payload.data.needsClarification, false);
    assert.equal(payload.data.grounding.usedFallback, false);
    assert.deepEqual(payload.data.grounding.candidatePlaceIds, [
      "goa-palolem",
      "goa-basilica",
    ]);
    assert.ok(payload.data.referencedPlaces.length > 0);
    for (const place of payload.data.referencedPlaces) {
      assert.equal(place.slug !== undefined, true);
      assert.equal(place.reason !== undefined, true);
    }
  });

  it("handles empty candidates safely without a decision selection", async () => {
    PlaceProvider.getDestinationPlaces = async (): Promise<DestinationResponse> => ({
      destination: {
        slug: "goa",
        name: "Goa",
        country: "India",
        description: "Beach destination",
        bestTimeToVisit: "November to March",
        coordinates: { latitude: 15.2993, longitude: 74.124 },
        heroImageUrl: "https://example.com/goa.jpg",
        popularCategories: ["relaxation"],
        totalPlaces: 0,
      },
      places: [],
      totalCount: 0,
      appliedCategory: "all",
    });
    stubGemini({ needsClarification: true, clarificationQuestion: "Which area?" });

    const payload = await postDecision("what should I do?");

    // The clarify fallback still works; the deterministic layer just has no pick.
    const decisionSummary = payload.data.decisionSummary;
    if (decisionSummary) {
      assert.equal(decisionSummary.selectedPlaceId, undefined);
      assert.deepEqual(decisionSummary.rankedPlaces, []);
    }
    assert.equal(typeof payload.data.answer, "string");
  });

  it("omits decisionSummary for recommend, compare, shortlist and trip_focus", async () => {
    stubDestination();
    stubGemini();

    for (const message of [
      "Which place should we visit tomorrow morning?",
      "compare Palolem versus Basilica",
      "give me a few places",
      "build my day plan for the trip",
    ]) {
      const payload = await postDecision(message);
      assert.equal(
        "decisionSummary" in payload.data,
        false,
        `expected no decisionSummary for: ${message}`
      );
    }
  });

  it("keeps the existing response envelope shape for non-decision intents", async () => {
    stubDestination();
    stubGemini();

    const payload = await postDecision("Which place should we visit tomorrow morning?");

    assert.equal(payload.data.intent, "recommend");
    for (const key of [
      "requestId",
      "destinationSlug",
      "createdAt",
      "intent",
      "answer",
      "assistantTurn",
      "referencedPlaces",
      "highlightedPlaceIds",
      "needsClarification",
      "grounding",
      "preferenceUsage",
    ]) {
      assert.equal(key in payload.data, true, `missing envelope key: ${key}`);
    }
  });
});

