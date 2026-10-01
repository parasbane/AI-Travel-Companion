import { NextResponse } from "next/server";
import {
  getItineraryItems,
  getTripDays,
  getTripPlan,
} from "@/lib/saved/tripsService";
import {
  MAX_INSTRUCTION_LENGTH,
  normalizeInstruction,
  planItinerary,
} from "@/lib/ai/itineraryPlanner";
import type {
  ItineraryProposal,
  ItineraryPlannerRequest,
} from "@/lib/ai/itineraryPlanner";
import type { RecommendationPreferences } from "@/lib/ai/types";
import { buildAiWeatherContext } from "@/lib/ai/weatherContext";
import { getDestinationWeather } from "@/lib/weather/service";
import type { DestinationWeatherResponse } from "@/lib/weather/types";

/**
 * Test seam so route tests never hit the live weather provider. Restoring with
 * null wraps the real service again.
 */
export type ItineraryRouteWeatherFetcher = (slug: string) => Promise<DestinationWeatherResponse>;

let itineraryRouteWeatherFetcher: ItineraryRouteWeatherFetcher = (slug: string) =>
  getDestinationWeather(slug);

export function setItineraryRouteWeatherFetcherForTesting(
  fetcher: ItineraryRouteWeatherFetcher | null
): void {
  itineraryRouteWeatherFetcher =
    fetcher ?? ((slug: string) => getDestinationWeather(slug));
}

export interface ItineraryApiRequest {
  requestId?: string;
  userId?: string;
  tripId: string;
  instruction?: string;
  preferences?: RecommendationPreferences;
}

export interface ItineraryApiSuccessData {
  requestId: string;
  tripId: string;
  createdAt: string;
  proposal: ItineraryProposal;
}

export interface ItineraryApiSuccessResponse {
  ok: true;
  data: ItineraryApiSuccessData;
}

export interface ItineraryApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ItineraryApiResponse = ItineraryApiSuccessResponse | ItineraryApiErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPreferenceObject(
  value: unknown
): value is ItineraryApiRequest["preferences"] {
  if (value == null) return true;
  if (!isRecord(value)) return false;

  const stylesValid = value.styles === undefined || isStringArray(value.styles);
  const budgetValid =
    value.budget === undefined ||
    value.budget === "budget" ||
    value.budget === "balanced" ||
    value.budget === "luxury";
  const groupValid =
    value.group === undefined ||
    value.group === "solo" ||
    value.group === "couple" ||
    value.group === "family" ||
    value.group === "friends";

  return stylesValid && budgetValid && groupValid;
}

export function validateItineraryRequest(
  body: unknown
):
  | { ok: true; value: ItineraryApiRequest }
  | { ok: false; status: number; error: ItineraryApiErrorResponse["error"] } {
  if (!isRecord(body)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    };
  }

  if (body.userId !== undefined && typeof body.userId !== "string") {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_REQUEST",
        message: "userId must be a string when provided.",
      },
    };
  }

  const tripId = typeof body.tripId === "string" ? body.tripId.trim() : "";
  if (!tripId) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_REQUEST",
        message: "tripId is required.",
      },
    };
  }

  const instruction = typeof body.instruction === "string" ? body.instruction : undefined;
  if (body.instruction !== undefined && typeof body.instruction !== "string") {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_REQUEST",
        message: "instruction must be a string when provided.",
      },
    };
  }
  if (instruction && instruction.trim().length > MAX_INSTRUCTION_LENGTH) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_REQUEST",
        message: `instruction must be ${MAX_INSTRUCTION_LENGTH} characters or fewer.`,
      },
    };
  }

  if (!isPreferenceObject(body.preferences)) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_REQUEST",
        message: "preferences must use supported budget, group, and styles values.",
      },
    };
  }

  return {
    ok: true,
    value: {
      requestId: typeof body.requestId === "string" ? body.requestId : undefined,
      userId: typeof body.userId === "string" ? body.userId.trim() : undefined,
      tripId,
      instruction,
      preferences: body.preferences,
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = validateItineraryRequest(body);

    if (!parsed.ok) {
      return NextResponse.json(parsed, { status: parsed.status });
    }

    const userId = parsed.value.userId;
    if (!userId) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Must be signed in to plan a trip itinerary.",
          },
        } satisfies ItineraryApiResponse,
        { status: 401 }
      );
    }

    const requestId = parsed.value.requestId?.trim() || crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // Build the travel context entirely from owned server data. Nothing in the
    // request body is trusted as place metadata or place identity — a client
    // can never inject places into the proposal by sending extra fields.
    const plan = await getTripPlan(userId, parsed.value.tripId);
    if (!plan) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "TRIP_NOT_FOUND",
            message: "Trip not found for this account.",
          },
        } satisfies ItineraryApiResponse,
        { status: 404 }
      );
    }

    const [days, items] = await Promise.all([
      getTripDays(userId, parsed.value.tripId),
      getItineraryItems(userId, parsed.value.tripId),
    ]);

    // Grounded weather for the trip's destination via the existing weather
    // service. Degrades gracefully: unavailable weather yields null context,
    // so itinerary planning keeps working from owned trip data alone.
    const weather = buildAiWeatherContext(
      await itineraryRouteWeatherFetcher(plan.trip.destinationSlug)
    );

    const plannerRequest: ItineraryPlannerRequest = {
      trip: plan.trip,
      days,
      places: plan.places,
      items,
      preferences: parsed.value.preferences ?? null,
      instruction: normalizeInstruction(parsed.value.instruction),
      weather,
    };

    const proposal = planItinerary(plannerRequest);

    return NextResponse.json(
      {
        ok: true,
        data: {
          requestId,
          tripId: parsed.value.tripId,
          createdAt: nowIso,
          proposal,
        },
      } satisfies ItineraryApiResponse,
      { status: 200 }
    );
  } catch {
    console.error("AI itinerary route failed");
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to plan the trip itinerary.",
        },
      } satisfies ItineraryApiResponse,
      { status: 500 }
    );
  }
}