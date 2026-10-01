import type {
  TripPlan,
  TripPlanIssue,
  TripPlanIssueCode,
  TripPlanIssueSeverity,
  TripPlanItem,
  TripPlanReport,
  TripPlanReportSummary,
  TripPlace,
} from "./types";

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isHhMm(value: string | null | undefined): value is string {
  return typeof value === "string" && HHMM_PATTERN.test(value);
}

const SEVERITY_RANK: Record<TripPlanIssueSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** Fixed, deterministic ordering across issue codes (within the same severity). */
const CODE_ORDER: TripPlanIssueCode[] = [
  "inverted-time-range",
  "day-outside-trip",
  "duplicate-place-cross-day",
  "overlapping-times",
  "empty-day",
  "unassigned-place",
];

/** An item with a usable, non-inverted HH:MM time window, used for overlap checks. */
interface TimedItem {
  itemId: string;
  placeName: string;
  startTime: string;
  endTime: string;
}

/** Build a stable ordering key: day number (padded) then a reference id. */
function issuePrimaryKey(issue: TripPlanIssue): string {
  const day = issue.dayNumber !== undefined ? `d${String(issue.dayNumber).padStart(4, "0")}` : "z";
  const ref = issue.placeId ?? issue.itemId ?? "";
  return `${day}:${ref}`;
}

function sortIssues(issues: TripPlanIssue[]): TripPlanIssue[] {
  return issues.sort((a, b) => {
    if (a.severity !== b.severity) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (a.code !== b.code) {
      return CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code);
    }
    const aKey = issuePrimaryKey(a);
    const bKey = issuePrimaryKey(b);
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    return 0;
  });
}

/** Collect usable, non-inverted HH:MM intervals for a single day. */
function usableTimedItems(items: TripPlanItem[]): TimedItem[] {
  const timed: TimedItem[] = [];
  for (const entry of items) {
    const { startTime, endTime } = entry.item;
    if (isHhMm(startTime) && isHhMm(endTime) && startTime <= endTime) {
      timed.push({
        itemId: entry.item.id,
        placeName: entry.item.placeName,
        startTime,
        endTime,
      });
    }
  }
  timed.sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) ||
      a.endTime.localeCompare(b.endTime) ||
      a.itemId.localeCompare(b.itemId)
  );
  return timed;
}

function overlaps(a: TimedItem, b: TimedItem): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Detect itinerary consistency issues across a trip plan.
 *
 * Checks (all read-only, deterministic, advisory):
 * - error  inverted-time-range: item start after its end
 * - error  day-outside-trip:    day's calendar date outside trip start/end
 * - warning duplicate-place-cross-day: same place assigned to 2+ days (advisory)
 * - warning overlapping-times:  two items with HH:MM windows that intersect
 * - info   empty-day:           a day with no planned items
 * - info   unassigned-place:    a trip place never added to any day
 *
 * The input trip plan is never mutated; every collected structure is a new
 * array, and issues are returned in a fixed order (severity, then code, then a
 * stable day/id key). Cross-day duplicates remain permitted by design — this
 * analysis only surfaces them for the user's awareness.
 */
export function analyzeTripPlan(tripPlan: TripPlan): TripPlanReport {
  const issues: TripPlanIssue[] = [];

  const scheduledPlaceIds = new Set<string>();
  for (const day of tripPlan.days) {
    day.items.forEach((entry) => scheduledPlaceIds.add(entry.item.placeId));

    if (day.isEmpty || day.items.length === 0) {
      issues.push({
        code: "empty-day",
        severity: "info",
        message: `Day ${day.dayNumber} has no activities planned yet.`,
        dayNumber: day.dayNumber,
      });
    }

    for (const entry of day.items) {
      const { startTime, endTime } = entry.item;
      if (isHhMm(startTime) && isHhMm(endTime) && startTime > endTime) {
        issues.push({
          code: "inverted-time-range",
          severity: "error",
          message: `${entry.item.placeName} has a start time after its end time.`,
          dayNumber: day.dayNumber,
          itemId: entry.item.id,
          placeId: entry.item.placeId,
        });
      }
    }

    const timed = usableTimedItems(day.items);
    for (let i = 1; i < timed.length; i++) {
      const earlier = timed[i - 1];
      const later = timed[i];
      if (overlaps(earlier, later)) {
        issues.push({
          code: "overlapping-times",
          severity: "warning",
          message: `${earlier.placeName} and ${later.placeName} overlap on Day ${day.dayNumber}.`,
          dayNumber: day.dayNumber,
          itemId: earlier.itemId,
        });
      }
    }
  }

  // day-outside-trip
  const { startDate, endDate } = tripPlan.trip;
  if (startDate && endDate) {
    for (const day of tripPlan.days) {
      if (day.calendarDate) {
        if (day.calendarDate < startDate || day.calendarDate > endDate) {
          issues.push({
            code: "day-outside-trip",
            severity: "error",
            message: `Day ${day.dayNumber} (${day.calendarDate}) is outside the trip's dates (${startDate} – ${endDate}).`,
            dayNumber: day.dayNumber,
          });
        }
      }
    }
  }

  // duplicate-place-cross-day (advisory only)
  const placeToDays = new Map<string, { placeName: string; days: number[]; firstItemId: string }>();
  for (const day of tripPlan.days) {
    for (const entry of day.items) {
      const existing = placeToDays.get(entry.item.placeId);
      if (existing) {
        if (!existing.days.includes(day.dayNumber)) existing.days.push(day.dayNumber);
      } else {
        placeToDays.set(entry.item.placeId, {
          placeName: entry.item.placeName,
          days: [day.dayNumber],
          firstItemId: entry.item.id,
        });
      }
    }
  }
  for (const [placeId, record] of placeToDays) {
    if (record.days.length >= 2) {
      const dayList = record.days.slice().sort((a, b) => a - b);
      issues.push({
        code: "duplicate-place-cross-day",
        severity: "warning",
        message: `${record.placeName} is scheduled on ${dayList.length} different days (${dayList
          .map((d) => `Day ${d}`)
          .join(", ")}).`,
        dayNumber: Math.min(...dayList),
        placeId,
        itemId: record.firstItemId,
      });
    }
  }

  // unassigned-place (trip places never added to any day)
  for (const place of uniquePlaces(tripPlan.places)) {
    if (!scheduledPlaceIds.has(place.placeId)) {
      issues.push({
        code: "unassigned-place",
        severity: "info",
        message: `${place.placeName} has not been added to any day yet.`,
        placeId: place.placeId,
      });
    }
  }

  const sortedIssues = sortIssues(issues);

  const emptyDays = tripPlan.days.filter((day) => day.isEmpty).length;
  const totalItems = tripPlan.days.reduce((sum, day) => sum + day.count, 0);

  const summary: TripPlanReportSummary = {
    totalDays: tripPlan.days.length,
    plannedDays: tripPlan.days.length - emptyDays,
    emptyDays,
    totalItems,
    unassignedPlaceCount: uniquePlaces(tripPlan.places).filter(
      (place) => !scheduledPlaceIds.has(place.placeId)
    ).length,
    issueCount: sortedIssues.length,
  };

  return {
    tripId: tripPlan.trip.id,
    summary,
    issues: sortedIssues,
  };
}

/** Preserve first-occurrence order while de-duplicating places by placeId. */
function uniquePlaces(places: TripPlace[]): TripPlace[] {
  const seen = new Set<string>();
  const unique: TripPlace[] = [];
  for (const place of places) {
    if (!seen.has(place.placeId)) {
      seen.add(place.placeId);
      unique.push(place);
    }
  }
  return unique;
}