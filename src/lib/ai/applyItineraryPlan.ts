import type {
  ItineraryItem,
  Trip,
  TripDay,
  TripPlace,
} from "@/lib/saved/types";

/**
 * The proposal shape an apply request cares about. The API boundary only ever
 * reads these fields; label/date/reasoning metadata is ignored so a client can
 * never smuggle place metadata into the persisted itinerary.
 */
export interface ApplyItineraryDayShape {
  dayNumber: number;
  scheduledPlaceIds: string[];
  suggestedPlaceIds: string[];
}

export interface ApplyItineraryProposalShape {
  tripId: string;
  days: ApplyItineraryDayShape[];
  unassignedPlaceIds: string[];
}

/**
 * Everything the pure applier needs. Trip, days, places, and items are always
 * derived from owned server data — the proposal only contributes place ids that
 * are validated against that pool.
 */
export interface ApplyItineraryPlanRequest {
  trip: Trip;
  days: TripDay[];
  places: TripPlace[];
  items: ItineraryItem[];
  proposal: ApplyItineraryProposalShape;
}

export interface PlanApplicationAddition {
  dayNumber: number;
  tripDayId: string;
  placeId: string;
  placeName: string;
}

export type PlanApplicationSkipReason = "already-scheduled";

export interface PlanApplicationSkipped extends PlanApplicationAddition {
  reason: PlanApplicationSkipReason;
}

export type PlanApplicationRejectReason = "unknown-place";

export interface PlanApplicationRejected {
  placeId: string;
  reason: PlanApplicationRejectReason;
}

/** Deterministic, additive application result. Never describes deletions. */
export interface PlanApplication {
  tripId: string;
  dayCount: number;
  /** Suggested places that can be persisted as new itinerary items. */
  additions: PlanApplicationAddition[];
  /** Suggestions already scheduled anywhere (including a prior apply). */
  skipped: PlanApplicationSkipped[];
  /** Proposal references to places that do not belong to this trip. */
  rejected: PlanApplicationRejected[];
  /** Scheduled references that were confirmed as already persisted items. */
  preservedScheduledPlaceIds: string[];
  /** Pool places the proposal intentionally left for the user to assign. */
  keptUnassignedPlaceIds: string[];
}

export class ApplyItineraryPlanError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApplyItineraryPlanError";
    this.code = code;
  }
}

/**
 * Compute what a proposal would apply to the owned trip context:
 *
 * - Never invents places — every reference must exist in the trip pool or it is
 *   rejected as unknown.
 * - Preserves existing scheduled items: scheduled references are confirmed, never
 *   touched, and never re-added.
 * - Prevents duplicate assignment within the diff and across re-application
 *   (already-scheduled suggestions are skipped).
 * - Keeps proposal.unassignedPlaceIds unassigned.
 * - Ignores proposal days whose day number does not resolve to an owned trip day.
 * - Pure and deterministic: identical inputs always produce identical output.
 */
export function computePlanApplication(
  request: ApplyItineraryPlanRequest
): PlanApplication {
  if (request.proposal.tripId !== request.trip.id) {
    throw new ApplyItineraryPlanError(
      "PROPOSAL_TRIP_MISMATCH",
      "The proposal does not belong to this trip."
    );
  }

  const dayByNumber = new Map<number, TripDay>();
  for (const day of request.days) {
    const dayNumber =
      typeof day.dayNumber === "number" && Number.isFinite(day.dayNumber)
        ? day.dayNumber
        : -1;
    if (!dayByNumber.has(dayNumber)) {
      dayByNumber.set(dayNumber, day);
    }
  }

  const placeById = new Map<string, TripPlace>(
    request.places.map((place) => [place.placeId, place])
  );

  const scheduledOnDay = new Map<string, Set<string>>();
  const scheduledAnywhere = new Set<string>();
  for (const item of request.items) {
    scheduledAnywhere.add(item.placeId);
    let list = scheduledOnDay.get(item.tripDayId);
    if (!list) {
      list = new Set<string>();
      scheduledOnDay.set(item.tripDayId, list);
    }
    list.add(item.placeId);
  }

  const additions: PlanApplicationAddition[] = [];
  const skipped: PlanApplicationSkipped[] = [];
  const rejected: PlanApplicationRejected[] = [];
  const preservedScheduledPlaceIds: string[] = [];
  const alreadyAdded = new Set<string>();

  for (const proposalDay of request.proposal.days) {
    const day = dayByNumber.get(proposalDay.dayNumber);
    if (!day) continue;

    const daySchedule = scheduledOnDay.get(day.id) ?? new Set<string>();

    for (const placeId of proposalDay.scheduledPlaceIds) {
      if (placeById.has(placeId) && daySchedule.has(placeId)) {
        preservedScheduledPlaceIds.push(placeId);
      }
    }

    for (const placeId of proposalDay.suggestedPlaceIds) {
      const place = placeById.get(placeId);
      if (!place) {
        rejected.push({ placeId, reason: "unknown-place" });
        continue;
      }
      if (scheduledAnywhere.has(placeId) || alreadyAdded.has(placeId)) {
        skipped.push({
          dayNumber: proposalDay.dayNumber,
          tripDayId: day.id,
          placeId,
          placeName: place.placeName,
          reason: "already-scheduled",
        });
        continue;
      }
      additions.push({
        dayNumber: proposalDay.dayNumber,
        tripDayId: day.id,
        placeId,
        placeName: place.placeName,
      });
      alreadyAdded.add(placeId);
    }
  }

  const keptUnassignedPlaceIds = request.proposal.unassignedPlaceIds.filter(
    (placeId) => placeById.has(placeId)
  );
  for (const placeId of request.proposal.unassignedPlaceIds) {
    if (!placeById.has(placeId)) {
      rejected.push({ placeId, reason: "unknown-place" });
    }
  }

  return {
    tripId: request.trip.id,
    dayCount: request.days.length,
    additions,
    skipped,
    rejected,
    preservedScheduledPlaceIds,
    keptUnassignedPlaceIds,
  };
}