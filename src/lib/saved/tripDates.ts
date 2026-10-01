import type { Trip } from "./types";

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

/** Format an ISO date (YYYY-MM-DD) for display, e.g. "Mar 3, 2026". Empty for missing/invalid input. */
export function formatTripDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", DEFAULT_DATE_OPTIONS);
}

/** Format a trip's start→end span, e.g. "Mar 3 – Mar 8, 2026". */
export function formatTripDateRange(trip: Trip): string {
  const start = formatTripDate(trip.startDate);
  const end = formatTripDate(trip.endDate);
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} onwards`;
  return "Dates not set yet";
}

/** Number of days spanned by a trip (inclusive of start & end), or null when dates are missing/invalid. */
export function tripDurationDays(trip: Trip): number | null {
  if (!trip.startDate || !trip.endDate) return null;
  const start = new Date(`${trip.startDate}T00:00:00`).getTime();
  const end = new Date(`${trip.endDate}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Expand a start→end range into one ISO date per day, or null when dates are missing/invalid. */
export function buildTripDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string[] | null {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return null;
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** A deterministic plan for making a trip's existing day dates match a date range. */
export interface TripDateReconciliation {
  /** ISO dates in the range that have no day yet — these days should be created. */
  missing: string[];
  /** Existing day dates outside the range — these days (and their items) should be removed. */
  outOfRange: string[];
}

/**
 * Compare a start→end range with the dates of a trip's existing days and report
 * which days are missing and which fall outside the range.
 *
 * - Reuses buildTripDates for the expected per-day list, so no calendar math is
 *   duplicated and ranges are validated exactly as day creation does.
 * - Returns null when the range is missing or invalid — callers treat this as
 *   "nothing to reconcile".
 * - Deterministic: `missing` follows the generated range order; `outOfRange`
 *   follows the order of the provided existing day dates.
 * - Days without a usable date are ignored and never classified.
 */
export function reconcileTripDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  existingDayDates: readonly (string | null | undefined)[]
): TripDateReconciliation | null {
  const expected = buildTripDates(startDate, endDate);
  if (expected === null) return null;

  const expectedSet = new Set(expected);

  const present: string[] = [];
  const seen = new Set<string>();
  for (const date of existingDayDates) {
    if (date && !seen.has(date)) {
      seen.add(date);
      present.push(date);
    }
  }
  const presentSet = new Set(present);

  return {
    missing: expected.filter((date) => !presentSet.has(date)),
    outOfRange: present.filter((date) => !expectedSet.has(date)),
  };
}

/** Format an "HH:MM" time in 12-hour form, e.g. "10:00 AM". Empty for invalid input. */
function formatTime12h(hhmm: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * Format an itinerary item's time range, e.g. "10:00 AM – 12:00 PM".
 * Returns null when no time is set, or when a provided time is invalid.
 */
export function formatTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined
): string | null {
  const start = startTime ? formatTime12h(startTime) : null;
  const end = endTime ? formatTime12h(endTime) : null;
  if (startTime && !start) return null;
  if (endTime && !end) return null;
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (end) return `until ${end}`;
  return null;
}
