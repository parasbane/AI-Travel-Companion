import { NextResponse } from "next/server";
import {
  applyItineraryPlanToTrip,
  getItineraryItems,
  getTripDays,
  getTripPlan,
} from "@/lib/saved/tripsService";
import {
  ApplyItineraryPlanError,
  computePlanApplication,
} from "@/lib/ai/applyItineraryPlan";
import type {
  ApplyItineraryProposalShape,
  PlanApplication,
} from "@/lib/ai/applyItineraryPlan";

export interface ApplyItineraryApiRequest {
  requestId?: string;
  userId?: string;
  tripId: string;
  proposal: ApplyItineraryProposalShape;
}

export interface AppliedStop {
  dayNumber: number;
  tripDayId: string;
  placeId: string;
  placeName: string;
  itemId: string;
}

export interface ApplyItineraryApiSuccessData {
  requestId: string;
  tripId: string;
  createdAt: string;
  application: {
    addedStopCount: number;
    daysApplied: number;
    applied: AppliedStop[];
    skippedCount: number;
    rejectedPlaceIds: string[];
    keptUnassignedCount: number;
    preservedScheduledCount: number;
  };
}

export interface ApplyItineraryApiSuccessResponse {
  ok: true;
  data: ApplyItineraryApiSuccessData;
}

export interface ApplyItineraryApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApplyItineraryApiResponse =
  | ApplyItineraryApiSuccessResponse
  | ApplyItineraryApiErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isApplyItineraryDayShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.dayNumber !== "number" || !Number.isFinite(value.dayNumber)) {
    return false;
  }
  if (value.scheduledPlaceIds !== undefined && !isStringArray(value.scheduledPlaceIds)) {
    return false;
  }
  if (value.suggestedPlaceIds !== undefined && !isStringArray(value.suggestedPlaceIds)) {
    return false;
  }
  return true;
}

function toApplyItineraryDayShape(value: unknown): ApplyItineraryProposalShape["days"][number] {
  if (
    !isRecord(value) ||
    typeof value.dayNumber !== "number" ||
    !Number.isFinite(value.dayNumber)
  ) {
    return { dayNumber: 0, scheduledPlaceIds: [], suggestedPlaceIds: [] };
  }
  return {
    dayNumber: value.dayNumber,
    scheduledPlaceIds: isStringArray(value.scheduledPlaceIds)
      ? value.scheduledPlaceIds
      : [],
    suggestedPlaceIds: isStringArray(value.suggestedPlaceIds)
      ? value.suggestedPlaceIds
      : [],
  };
}

export function validateApplyItineraryRequest(
  body: unknown
):
  | { ok: true; value: ApplyItineraryApiRequest }
  | { ok: false; status: number; error: ApplyItineraryApiErrorResponse["error"] } {
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

  const proposal = body.proposal;
  if (!isRecord(proposal)) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_PROPOSAL",
        message: "A proposal object is required.",
      },
    };
  }

  if (typeof proposal.tripId !== "string" || !proposal.tripId.trim()) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_PROPOSAL",
        message: "The proposal must include a valid tripId.",
      },
    };
  }

  if (!Array.isArray(proposal.days) || !proposal.days.every(isApplyItineraryDayShape)) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_PROPOSAL",
        message: "The proposal days must be valid day documents.",
      },
    };
  }

  if (proposal.unassignedPlaceIds !== undefined && !isStringArray(proposal.unassignedPlaceIds)) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_PROPOSAL",
        message: "unassignedPlaceIds must be an array of strings when provided.",
      },
    };
  }

  return {
    ok: true,
    value: {
      requestId: typeof body.requestId === "string" ? body.requestId : undefined,
      userId: typeof body.userId === "string" ? body.userId.trim() : undefined,
      tripId,
      proposal: {
        tripId: proposal.tripId,
        days: proposal.days.map(toApplyItineraryDayShape),
        unassignedPlaceIds: isStringArray(proposal.unassignedPlaceIds)
          ? proposal.unassignedPlaceIds
          : [],
      },
    },
  };
}

function internalError(message: string): ApplyItineraryApiErrorResponse {
  return {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message,
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = validateApplyItineraryRequest(body);

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
            message: "Must be signed in to apply a trip itinerary plan.",
          },
        } satisfies ApplyItineraryApiResponse,
        { status: 401 }
      );
    }

    const requestId = parsed.value.requestId?.trim() || crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // Load the real server-side trip context. Nothing in the request body is
    // trusted as place metadata or place identity.
    const plan = await getTripPlan(userId, parsed.value.tripId);
    if (!plan) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "TRIP_NOT_FOUND",
            message: "Trip not found for this account.",
          },
        } satisfies ApplyItineraryApiResponse,
        { status: 404 }
      );
    }

    const [days, items] = await Promise.all([
      getTripDays(userId, parsed.value.tripId),
      getItineraryItems(userId, parsed.value.tripId),
    ]);

    let application: PlanApplication;
    try {
      application = computePlanApplication({
        trip: plan.trip,
        days,
        places: plan.places,
        items,
        proposal: parsed.value.proposal,
      });
    } catch (error) {
      if (error instanceof ApplyItineraryPlanError) {
        return NextResponse.json(
          {
            ok: false,
            error: { code: error.code, message: error.message },
          } satisfies ApplyItineraryApiResponse,
          { status: 422 }
        );
      }
      throw error;
    }

    const applied = await applyItineraryPlanToTrip(userId, {
      tripId: parsed.value.tripId,
      additions: application.additions,
    });

    const dayNumberByTripDayId = new Map<string, number>();
    for (const day of days) {
      if (!dayNumberByTripDayId.has(day.id)) {
        dayNumberByTripDayId.set(day.id, day.dayNumber);
      }
    }

    const appliedStops = applied.map((item) => ({
      dayNumber: dayNumberByTripDayId.get(item.tripDayId) ?? -1,
      tripDayId: item.tripDayId,
      placeId: item.placeId,
      placeName: item.placeName,
      itemId: item.id,
    }));

    const daysApplied = new Set(appliedStops.map((stop) => stop.dayNumber)).size;

    return NextResponse.json(
      {
        ok: true,
        data: {
          requestId,
          tripId: parsed.value.tripId,
          createdAt: nowIso,
          application: {
            addedStopCount: appliedStops.length,
            daysApplied,
            applied: appliedStops,
            skippedCount: application.skipped.length,
            rejectedPlaceIds: application.rejected.map((entry) => entry.placeId),
            keptUnassignedCount: application.keptUnassignedPlaceIds.length,
            preservedScheduledCount: application.preservedScheduledPlaceIds.length,
          },
        },
      } satisfies ApplyItineraryApiResponse,
      { status: 200 }
    );
  } catch {
    console.error("AI itinerary apply route failed");
    return NextResponse.json(internalError("Failed to apply the trip itinerary plan."), {
      status: 500,
    });
  }
}