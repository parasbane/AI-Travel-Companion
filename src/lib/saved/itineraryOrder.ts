import type { ItineraryItem } from "./types";

/**
 * Sort key for stops without a start time. Larger than any valid "HH:MM"
 * value ("23:59" < "99:99"), so untimed stops sort after timed stops.
 */
const NO_TIME = "99:99";

/**
 * Chronological display ordering for a single trip day's stops.
 *
 * Stops with a start time come first, ordered by time of day. Stops without a
 * time stay visible and keep their existing sort order, giving a deterministic
 * result for stops with the same or no time.
 */
export function orderItineraryItems(items: ItineraryItem[]): ItineraryItem[] {
  return items.slice().sort(compareItineraryItems);
}

function compareItineraryItems(a: ItineraryItem, b: ItineraryItem): number {
  const aTimeKey = a.startTime ?? NO_TIME;
  const bTimeKey = b.startTime ?? NO_TIME;
  if (aTimeKey !== bTimeKey) return aTimeKey < bTimeKey ? -1 : 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt.localeCompare(b.createdAt);
}