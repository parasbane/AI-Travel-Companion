import type {
  Place,
  PriceLevel,
  RecommendationPreferences,
} from "@/lib/places/types";
import { hasPersonalizationPrefs, rankPlaces } from "@/lib/places/scoring";
import type {
  ItineraryItem,
  Trip,
  TripDay,
  TripPlace,
} from "@/lib/saved/types";
import { formatTripDate } from "@/lib/saved/tripDates";
import { buildDayWeatherNote } from "./weatherContext";
import type { AiWeatherContext } from "./weatherContext";

/** Upper bound on suggested places the planner will place on any single day. */
export const MAX_SUGGESTIONS_PER_DAY = 4;

/** Maximum accepted instruction length, enforced at the API boundary. */
export const MAX_INSTRUCTION_LENGTH = 500;

/**
 * Everything a planner needs to reason about a trip. The trip, its days,
 * its saved places, and its scheduled itinerary items are always derived
 * from owned data server-side — never trusted from the client.
 */
export interface ItineraryPlannerRequest {
  trip: Trip;
  days: TripDay[];
  places: TripPlace[];
  items: ItineraryItem[];
  preferences?: RecommendationPreferences | null;
  instruction?: string | null;
  /**
   * Optional grounded weather/forecast context (server-derived). When a trip
   * day's calendarDate matches a forecast date, the day's reasoning gains a
   * factual, metric-only forecast note. It never reorders or reclassifies
   * suggestions — Feature 18 remains the only weather classifier.
   */
  weather?: AiWeatherContext | null;
}

export interface ItineraryProposalDay {
  dayNumber: number;
  calendarDate: string | null;
  label: string;
  /** Places the user already scheduled on this day, in display order. */
  scheduledPlaceIds: string[];
  /** Places the planner newly suggests for this day. */
  suggestedPlaceIds: string[];
  /** Convenience lookup: scheduled then suggested, in display order. */
  orderedPlaceIds: string[];
  scheduleCount: number;
  suggestionCount: number;
  reasoning: string;
}

export interface ItineraryProposal {
  tripId: string;
  title: string;
  destinationName: string;
  destinationSlug: string;
  startDate: string | null;
  endDate: string | null;
  dayCount: number;
  instruction: string | null;
  /** Whether traveler preferences influenced suggestion ordering. */
  usedPreferences: boolean;
  scheduleCount: number;
  suggestionCount: number;
  /** Pool places there wasn't enough per-day capacity (or day count) to place. */
  unassignedPlaceIds: string[];
  days: ItineraryProposalDay[];
  source: string;
}

export class ItineraryPlannerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ItineraryPlannerError";
    this.code = code;
  }
}

/**
 * Collapse whitespace and trim a raw instruction string.
 * Returns null for missing/empty input. Does not enforce length — that is an
 * API-boundary concern (see MAX_INSTRUCTION_LENGTH).
 */
export function normalizeInstruction(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPreferenceObject(value: unknown): value is RecommendationPreferences {
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

export function validateItineraryPlannerRequest(
  value: unknown
):
  | { ok: true; value: ItineraryPlannerRequest }
  | { ok: false; code: string; message: string } {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: "An itinerary planner request object is required.",
    };
  }

  if (
    !isRecord(value.trip) ||
    typeof value.trip.id !== "string" ||
    !value.trip.id.trim()
  ) {
    return {
      ok: false,
      code: "INVALID_TRIP",
      message: "A trip with a valid id is required.",
    };
  }

  if (!Array.isArray(value.days)) {
    return {
      ok: false,
      code: "INVALID_DAYS",
      message: "days must be an array of trip days.",
    };
  }

  if (!Array.isArray(value.places)) {
    return {
      ok: false,
      code: "INVALID_PLACES",
      message: "places must be an array of trip places.",
    };
  }

  if (!Array.isArray(value.items)) {
    return {
      ok: false,
      code: "INVALID_ITEMS",
      message: "items must be an array of itinerary items.",
    };
  }

  if (value.preferences !== undefined && !isPreferenceObject(value.preferences)) {
    return {
      ok: false,
      code: "INVALID_PREFERENCES",
      message: "preferences must use supported budget, group, and styles values.",
    };
  }

  if (value.instruction != null && typeof value.instruction !== "string") {
    return {
      ok: false,
      code: "INVALID_INSTRUCTION",
      message: "instruction must be a string or null when provided.",
    };
  }

  if (value.weather != null && !isRecord(value.weather)) {
    return {
      ok: false,
      code: "INVALID_WEATHER",
      message: "weather must be a weather context object or null when provided.",
    };
  }

  return {
    ok: true,
    value: {
      trip: value.trip as unknown as Trip,
      days: value.days as TripDay[],
      places: value.places as TripPlace[],
      items: value.items as ItineraryItem[],
      preferences:
        value.preferences === undefined ? null : (value.preferences as RecommendationPreferences),
      instruction: value.instruction == null ? null : (value.instruction as string),
      weather:
        value.weather == null ? null : (value.weather as unknown as AiWeatherContext),
    },
  };
}

/**
 * Minimal read of a saved trip place that scorePlace can consume.
 * scorePlace only reads category, priceLevel, rating, and tags.
 */
function toPlaceLike(place: TripPlace): Place {
  return {
    id: place.placeId,
    slug: place.placeId,
    name: place.placeName,
    destination: place.destinationSlug,
    destinationSlug: place.destinationSlug,
    category: place.placeCategory,
    description: place.placeName,
    rating: place.placeRating ?? 0,
    reviewCount: 0,
    priceLevel: (place.placePriceLevel ?? "moderate") as PriceLevel,
    address: "",
    coordinates: { latitude: 0, longitude: 0 },
    imageUrl: "",
    tags: [],
  };
}

function buildDayReasoning(input: {
  dayNumber: number;
  scheduleCount: number;
  suggestionCount: number;
  usedPreferences: boolean;
}): string {
  if (input.scheduleCount === 0 && input.suggestionCount === 0) {
    return "No places to assign — add places to this trip to plan this day.";
  }

  const parts: string[] = [];
  if (input.scheduleCount > 0) {
    parts.push(
      `kept ${input.scheduleCount} already scheduled stop${input.scheduleCount === 1 ? "" : "s"}`
    );
  }
  if (input.suggestionCount > 0) {
    parts.push(
      `added ${input.suggestionCount} suggestion${input.suggestionCount === 1 ? "" : "s"}${
        input.usedPreferences ? " ranked against your preferences" : ""
      }`
    );
  }
  return `${parts.join(", ")}.`;
}

/**
 * Pluggable itinerary planning strategies. Deterministic v1 today; LLM later.
 */
export interface ItineraryPlanner {
  readonly id: string;
  plan(request: ItineraryPlannerRequest): ItineraryProposal;
}

/**
 * Pure deterministic planner:
 * - Never invents places — only uses the trip's existing pool and items.
 * - Preserves all scheduled items exactly as the user placed them.
 * - Suggests only unassigned places, at most once across the whole trip.
 * - Ranks suggestions with the existing matchScore when preferences exist,
 *   otherwise preserves the order places were added.
 * - Distributes suggestions evenly across days round-robin (deterministic).
 * - Leaves any overflow unassigned rather than overfilling a day.
 */
export class DeterministicItineraryPlanner implements ItineraryPlanner {
  readonly id = "deterministic";

  plan(request: ItineraryPlannerRequest): ItineraryProposal {
    const trip = request.trip;

    // Deterministic day list: unique day numbers ascending, first occurrence
    // wins for its date.
    const dayNumbers: number[] = [];
    const dateByDayNumber = new Map<number, string | null>();
    const dayNumberByTripDayId = new Map<string, number>();

    for (const day of request.days) {
      const dayNumber =
        typeof day.dayNumber === "number" && Number.isFinite(day.dayNumber)
          ? day.dayNumber
          : -1;
      if (!dayNumbers.includes(dayNumber)) {
        dayNumbers.push(dayNumber);
        dateByDayNumber.set(dayNumber, typeof day.date === "string" ? day.date : null);
      }
      if (!dayNumberByTripDayId.has(day.id)) {
        dayNumberByTripDayId.set(day.id, dayNumber);
      }
    }
    dayNumbers.sort((a, b) => a - b);

    // Group scheduled items by day, tracking every place already scheduled
    // anywhere so it can never be re-suggested.
    const scheduledByDayNumber = new Map<number, string[]>();
    const scheduledAnywhere = new Set<string>();
    for (const item of request.items) {
      scheduledAnywhere.add(item.placeId);
      const dayNumber = dayNumberByTripDayId.get(item.tripDayId);
      if (dayNumber !== undefined && dayNumber >= 0) {
        const list = scheduledByDayNumber.get(dayNumber) ?? [];
        if (!list.includes(item.placeId)) {
          list.push(item.placeId);
          scheduledByDayNumber.set(dayNumber, list);
        }
      }
    }

    const placeById = new Map<string, TripPlace>(
      request.places.map((place) => [place.placeId, place])
    );

    const candidates = request.places
      .map((place) => place.placeId)
      .filter((placeId) => !scheduledAnywhere.has(placeId));

    const preferences = request.preferences ?? null;
    const usedPreferences = hasPersonalizationPrefs(preferences);

    // Reuse the existing ranking architecture (rankPlaces -> scorePlace) so the
    // planner never introduces a second scoring system. rankPlaces is
    // deterministic: matchScore desc with a stable pool-order tie-break, and a
    // passthrough in pool order when no preferences exist.
    const rankedCandidateIds = rankPlaces(
      candidates.map((placeId) => toPlaceLike(placeById.get(placeId)!)),
      preferences
    ).map((place) => place.id);

    const dayRows = dayNumbers.map((dayNumber) => ({
      dayNumber,
      calendarDate: dateByDayNumber.get(dayNumber) ?? null,
      scheduledPlaceIds: scheduledByDayNumber.get(dayNumber) ?? [],
      suggestedPlaceIds: [] as string[],
    }));

    const dayCount = dayRows.length;
    const capacityPerDay =
      dayCount === 0
        ? 0
        : Math.max(
            1,
            Math.min(MAX_SUGGESTIONS_PER_DAY, Math.ceil(candidates.length / dayCount))
          );

    // Round-robin: start from the day after the previous placement and circle
    // forward until one has capacity. Deterministic for identical inputs.
    let nextDayIndex = 0;
    for (const placeId of rankedCandidateIds) {
      if (dayCount === 0 || capacityPerDay === 0) break;
      let placed = false;
      for (let attempt = 0; attempt < dayCount; attempt += 1) {
        const rowIndex = (nextDayIndex + attempt) % dayCount;
        const row = dayRows[rowIndex];
        if (row.suggestedPlaceIds.length < capacityPerDay) {
          row.suggestedPlaceIds.push(placeId);
          placed = true;
          nextDayIndex = (rowIndex + 1) % dayCount;
          break;
        }
      }
      if (!placed) break;
    }

    const placedSuggestionIds = new Set<string>();
    for (const row of dayRows) {
      for (const placeId of row.suggestedPlaceIds) {
        placedSuggestionIds.add(placeId);
      }
    }

    const days: ItineraryProposalDay[] = dayRows.map((row) => {
      const scheduleCount = row.scheduledPlaceIds.length;
      const suggestionCount = row.suggestedPlaceIds.length;
      const baseReasoning = buildDayReasoning({
        dayNumber: row.dayNumber,
        scheduleCount,
        suggestionCount,
        usedPreferences,
      });
      const weatherNote = buildDayWeatherNote(request.weather ?? null, row.calendarDate);
      return {
        dayNumber: row.dayNumber,
        calendarDate: row.calendarDate,
        label: row.calendarDate ? formatTripDate(row.calendarDate) : `Day ${row.dayNumber}`,
        scheduledPlaceIds: row.scheduledPlaceIds,
        suggestedPlaceIds: row.suggestedPlaceIds,
        orderedPlaceIds: [...row.scheduledPlaceIds, ...row.suggestedPlaceIds],
        scheduleCount,
        suggestionCount,
        reasoning: weatherNote ? `${baseReasoning} ${weatherNote}` : baseReasoning,
      };
    });

    return {
      tripId: trip.id,
      title: trip.title,
      destinationName: trip.destinationName,
      destinationSlug: trip.destinationSlug,
      startDate: trip.startDate,
      endDate: trip.endDate,
      dayCount,
      instruction: normalizeInstruction(request.instruction),
      usedPreferences,
      scheduleCount: days.reduce((sum, day) => sum + day.scheduleCount, 0),
      suggestionCount: placedSuggestionIds.size,
      unassignedPlaceIds: rankedCandidateIds.filter(
        (placeId) => !placedSuggestionIds.has(placeId)
      ),
      days,
      source: "deterministic",
    };
  }
}

export type ItineraryPlannerKind = "deterministic";

let defaultPlanner: ItineraryPlanner = new DeterministicItineraryPlanner();

/**
 * Factory for itinerary planners. Extend with `"llm"` when an LLM layer ships.
 */
export function createItineraryPlanner(
  kind: ItineraryPlannerKind = "deterministic"
): ItineraryPlanner {
  switch (kind) {
    case "deterministic":
      return new DeterministicItineraryPlanner();
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function getDefaultItineraryPlanner(): ItineraryPlanner {
  return defaultPlanner;
}

/** Test / future DI hook — swap in an LLM planner without touching callers. */
export function setDefaultItineraryPlanner(planner: ItineraryPlanner): void {
  defaultPlanner = planner;
}

/**
 * Validate and run the default (or injected) planner.
 * Throws ItineraryPlannerError for malformed requests.
 */
export function planItinerary(
  request: ItineraryPlannerRequest,
  planner: ItineraryPlanner = getDefaultItineraryPlanner()
): ItineraryProposal {
  const checked = validateItineraryPlannerRequest(request);
  if (!checked.ok) {
    throw new ItineraryPlannerError(checked.code, checked.message);
  }
  return planner.plan(checked.value);
}