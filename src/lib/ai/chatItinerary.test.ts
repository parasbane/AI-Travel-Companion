import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { buildChatItineraryProposal } from "./chatItinerary";
import type { AiWeatherContext } from "./weatherContext";
import {
  addPlaceToItinerary,
  addPlaceToTrip,
  createTrip,
  createTripDays,
} from "@/lib/saved/tripsService";

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

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let storage = new MemoryStorage();

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
  await addPlaceToTrip("user-a", {
    tripId: trip.id,
    placeId: "goa-basilica",
    destinationSlug: "goa",
    placeName: "Basilica of Bom Jesus",
    placeCategory: "culture",
  });
  const days = await createTripDays("user-a", trip.id);
  await addPlaceToItinerary("user-a", {
    tripId: trip.id,
    tripDayId: days[0].id,
    placeId: "goa-palolem",
  });
  return trip.id;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  storage = new MemoryStorage();
  Object.assign(globalThis, { localStorage: storage });
});

afterEach(() => {
  if (originalUrl !== undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (originalKey !== undefined) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
});

describe("buildChatItineraryProposal", () => {
  it("returns a deterministic proposal derived from owned trip data", async () => {
    const tripId = await createGoaTrip();

    const proposal = await buildChatItineraryProposal({
      userId: "user-a",
      tripId,
      instruction: "plan my itinerary",
      preferences: { budget: "balanced", styles: ["relaxation"] },
    });

    assert.ok(proposal, "expected a proposal for an owned trip");
    assert.equal(proposal.tripId, tripId);
    assert.equal(proposal.source, "deterministic");
    assert.equal(proposal.destinationName, "Goa");
    assert.equal(proposal.dayCount, 5);
    assert.equal(proposal.scheduleCount, 1);
    assert.equal(proposal.usedPreferences, true);
    assert.equal(proposal.instruction, "plan my itinerary");

    // Scheduled day 1 keeps the already-planned stop exactly as scheduled.
    const dayOne = proposal.days.find((day) => day.dayNumber === 1);
    assert.ok(dayOne);
    assert.deepEqual(dayOne.scheduledPlaceIds, ["goa-palolem"]);

    // Suggestions are only owned, previously unscheduled places.
    const allSuggested = proposal.days.flatMap((day) => day.suggestedPlaceIds);
    for (const placeId of allSuggested) {
      assert.equal(
        ["goa-palolem", "goa-basilica"].includes(placeId),
        true,
        `suggestion ${placeId} must be an owned trip place`
      );
    }
    assert.equal(allSuggested.includes("goa-palolem"), false);
  });

  it("returns a proposal even when there is nothing left to suggest", async () => {
    const tripId = await createGoaTrip();
    await addPlaceToTrip("user-a", {
      tripId,
      placeId: "goa-extra",
      destinationSlug: "goa",
      placeName: "Extra Spot",
      placeCategory: "relaxation",
    });

    const proposal = await buildChatItineraryProposal({
      userId: "user-a",
      tripId,
      instruction: "",
    });

    assert.ok(proposal);
    assert.equal(proposal.instruction, null);
    assert.ok(proposal.suggestionCount >= 1);
  });

  it("returns null for a trip the user does not own", async () => {
    const tripId = await createGoaTrip();

    const proposal = await buildChatItineraryProposal({
      userId: "some-other-user",
      tripId,
      instruction: "plan my itinerary",
    });

    assert.equal(proposal, null);
  });

  it("returns null when the trip cannot be resolved", async () => {
    const proposal = await buildChatItineraryProposal({
      userId: "user-a",
      tripId: "no-such-trip",
      instruction: "plan my itinerary",
    });

    assert.equal(proposal, null);
  });

  it("annotates owned-trip proposal days with grounded forecast notes", async () => {
    const tripId = await createGoaTrip();
    const weather: AiWeatherContext = {
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
      ],
      summary: "In Goa: Currently Light rain at 25°C.",
    };

    const proposal = await buildChatItineraryProposal({
      userId: "user-a",
      tripId,
      instruction: "plan a rainy day for my Goa trip",
      weather,
    });

    assert.ok(proposal);
    assert.equal(proposal.destinationSlug, "goa");
    const dayOne = proposal.days.find((day) => day.dayNumber === 1);
    assert.ok(dayOne);
    assert.match(dayOne.reasoning, /Forecast for this day: Moderate rain, 27°C \/ 24°C, 90% rain\./);
    assert.equal(proposal.days[1].reasoning.includes("Forecast for this day"), false);
  });

  it("never produces a proposal with weather notes for a trip the user does not own", async () => {
    const tripId = await createGoaTrip();
    const weather: AiWeatherContext = {
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
      forecast: [],
      summary: "In Goa: Currently Light rain at 25°C.",
    };

    const proposal = await buildChatItineraryProposal({
      userId: "some-other-user",
      tripId,
      instruction: "plan my itinerary",
      weather,
    });

    assert.equal(proposal, null);
  });
});