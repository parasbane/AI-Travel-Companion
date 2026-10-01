import {
  getItineraryItems,
  getTripDays,
  getTripPlan,
} from "@/lib/saved/tripsService";
import type { RecommendationPreferences } from "./types";
import type { AiWeatherContext } from "./weatherContext";
import {
  normalizeInstruction,
  planItinerary,
} from "./itineraryPlanner";
import type { ItineraryProposal } from "./itineraryPlanner";

export interface BuildChatItineraryProposalInput {
  userId: string;
  tripId: string;
  instruction: string;
  preferences?: RecommendationPreferences | null;
  weather?: AiWeatherContext | null;
}

/**
 * Derive a deterministic itinerary proposal for a signed-in user's own trip,
 * using exactly the same planner path as POST /api/ai/itinerary. Ownership is
 * enforced by the underlying trip services (a userId that does not own the
 * trip yields null, never leaking another user's data). Any planning failure
 * yields null so an optional plan never breaks the destination chat flow.
 */
export async function buildChatItineraryProposal(
  input: BuildChatItineraryProposalInput
): Promise<ItineraryProposal | null> {
  try {
    const plan = await getTripPlan(input.userId, input.tripId);
    if (!plan) return null;

    const [days, items] = await Promise.all([
      getTripDays(input.userId, input.tripId),
      getItineraryItems(input.userId, input.tripId),
    ]);

    return planItinerary({
      trip: plan.trip,
      days,
      places: plan.places,
      items,
      preferences: input.preferences ?? null,
      instruction: normalizeInstruction(input.instruction),
      weather: input.weather ?? null,
    });
  } catch {
    return null;
  }
}