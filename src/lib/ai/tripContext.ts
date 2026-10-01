import { getTripPlan, getTripPlanReport } from "@/lib/saved/tripsService";
import { formatTripDateRange } from "@/lib/saved/tripDates";
import type { TripPlan, TripPlanReport } from "@/lib/saved/types";

export interface LoadedTripContext {
  tripId: string;
  plan: TripPlan;
  report: TripPlanReport;
}

/**
 * Load the deterministic trip snapshot and its itinerary consistency report
 * for a chat request. Ownership and authentication are enforced by the
 * underlying trip services: a userId that does not own the trip yields null
 * (never throwing or leaking another user's trip). Missing, malformed, or
 * empty identifiers also yield null, so the destination chat flow is
 * unaffected when no trip context applies.
 */
export async function loadTripContext(
  userId: string | undefined,
  tripId: string | undefined
): Promise<LoadedTripContext | null> {
  const normalizedUserId = userId?.trim();
  const normalizedTripId = tripId?.trim();
  if (!normalizedUserId || !normalizedTripId) return null;

  try {
    const [plan, report] = await Promise.all([
      getTripPlan(normalizedUserId, normalizedTripId),
      getTripPlanReport(normalizedUserId, normalizedTripId),
    ]);
    if (!plan || !report) return null;
    return { tripId: normalizedTripId, plan, report };
  } catch {
    return null;
  }
}

function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/**
 * Deterministic, human-readable summary of a loaded trip plan and its
 * consistency report, used by the trip_focus fallback path when the model
 * is unavailable. Produces no trip-specific opinions, only facts.
 */
export function buildTripFocusSummary(plan: TripPlan, report: TripPlanReport): string {
  const trip = plan.trip;
  const title = trip.title.trim() || "Untitled trip";
  const destination = trip.destinationName.trim() || trip.destinationSlug;
  const dateRange = formatTripDateRange(trip);
  const days = pluralize(plan.days.length, "day");
  const stops = pluralize(plan.totalItems, "scheduled stop");
  const plannedDays =
    plan.plannedDays === plan.days.length
      ? `all ${plan.days.length} days covered`
      : pluralize(plan.plannedDays, "planned day");
  const issues = pluralize(report.summary.issueCount, "issue");

  return (
    `I have your trip context loaded: "${title}" — ${days} in ${destination} (${dateRange}) with ${stops}, ${plannedDays}. ` +
    `The itinerary consistency report flags ${issues} to review. Your trip plan and its report are now part of this conversation.`
  );
}