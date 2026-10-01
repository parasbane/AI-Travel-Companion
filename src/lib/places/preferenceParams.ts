import type {
  BudgetPreference,
  RecommendationPreferences,
  TravelGroupPreference,
} from "./types";
import {
  hasPersonalizationPrefs,
  parseStylesQueryParam,
} from "./scoring";
import {
  BUDGET_PREFERENCE_IDS,
  TRAVEL_GROUP_IDS,
  TRIP_PREFERENCE_IDS,
  type TripPreference,
} from "./preferenceOptions";

/** Session personalization mirrored in the destination URL (and API contract). */
export interface SessionPersonalizationParams {
  styles: string[];
  budget?: BudgetPreference;
  group?: TravelGroupPreference;
  /** Soft only — never passed into scorePlace. */
  trip?: TripPreference;
}

export const PERSONALIZATION_QUERY_KEYS = [
  "styles",
  "group",
  "budgetPreference",
  "trip",
] as const;

function firstParam(
  raw: string | string[] | undefined | null
): string | undefined {
  if (raw == null) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseBudgetPreferenceParam(
  raw: string | string[] | undefined | null
): BudgetPreference | undefined {
  const value = firstParam(raw);
  if (value && BUDGET_PREFERENCE_IDS.has(value as BudgetPreference)) {
    return value as BudgetPreference;
  }
  return undefined;
}

export function parseGroupPreferenceParam(
  raw: string | string[] | undefined | null
): TravelGroupPreference | undefined {
  const value = firstParam(raw);
  if (value && TRAVEL_GROUP_IDS.has(value as TravelGroupPreference)) {
    return value as TravelGroupPreference;
  }
  return undefined;
}

export function parseTripPreferenceParam(
  raw: string | string[] | undefined | null
): TripPreference | undefined {
  const value = firstParam(raw);
  if (value && TRIP_PREFERENCE_IDS.has(value as TripPreference)) {
    return value as TripPreference;
  }
  return undefined;
}

/**
 * Parse destination/API personalization query params into a session object.
 * Invalid values are dropped; unrelated keys are ignored.
 */
export function parsePersonalizationSearchParams(searchParams: {
  styles?: string | string[] | null;
  group?: string | string[] | null;
  budgetPreference?: string | string[] | null;
  trip?: string | string[] | null;
  [key: string]: string | string[] | undefined | null;
}): SessionPersonalizationParams {
  const styles = parseStylesQueryParam(searchParams.styles);
  const budget = parseBudgetPreferenceParam(searchParams.budgetPreference);
  const group = parseGroupPreferenceParam(searchParams.group);
  const trip = parseTripPreferenceParam(searchParams.trip);

  const session: SessionPersonalizationParams = { styles };
  if (budget) session.budget = budget;
  if (group) session.group = group;
  if (trip) session.trip = trip;
  return session;
}

/** True when the session URL carries any scoring preference signal. */
export function hasSessionPersonalizationPrefs(
  session: SessionPersonalizationParams | null | undefined
): boolean {
  if (!session) return false;
  return hasPersonalizationPrefs({
    styles: session.styles,
    budget: session.budget,
    group: session.group,
  });
}

/** Scoring payload from session params (excludes trip). */
export function sessionToRecommendationPreferences(
  session: SessionPersonalizationParams
): RecommendationPreferences {
  const prefs: RecommendationPreferences = {};
  if (session.styles.length > 0) prefs.styles = session.styles;
  if (session.budget) prefs.budget = session.budget;
  if (session.group) prefs.group = session.group;
  return prefs;
}

/**
 * Write personalization keys onto a URLSearchParams instance.
 * Clears previous personalization keys first; preserves unrelated keys.
 */
export function applyPersonalizationToSearchParams(
  params: URLSearchParams,
  session: SessionPersonalizationParams
): URLSearchParams {
  for (const key of PERSONALIZATION_QUERY_KEYS) {
    params.delete(key);
  }

  if (session.styles.length > 0) {
    params.set("styles", session.styles.join(","));
  }
  if (session.group) {
    params.set("group", session.group);
  }
  if (session.budget) {
    params.set("budgetPreference", session.budget);
  }
  if (session.trip) {
    params.set("trip", session.trip);
  }

  return params;
}

/** Round-trip helper for tests and callers that start from prefs + optional trip. */
export function encodePersonalizationQuery(
  prefs: RecommendationPreferences,
  trip?: TripPreference
): string {
  const session: SessionPersonalizationParams = {
    styles: prefs.styles ?? [],
    budget: prefs.budget,
    group: prefs.group,
    trip,
  };
  const params = applyPersonalizationToSearchParams(
    new URLSearchParams(),
    session
  );
  return params.toString();
}

export function decodePersonalizationQuery(
  query: string
): SessionPersonalizationParams {
  const params = new URLSearchParams(query);
  return parsePersonalizationSearchParams({
    styles: params.get("styles"),
    group: params.get("group"),
    budgetPreference: params.get("budgetPreference"),
    trip: params.get("trip"),
  });
}
