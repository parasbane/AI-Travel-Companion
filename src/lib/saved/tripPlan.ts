import { orderItineraryItems } from "./itineraryOrder";
import { formatTimeRange, formatTripDate } from "./tripDates";
import type {
  ItineraryItem,
  Trip,
  TripDay,
  TripPlan,
  TripPlanDay,
  TripPlanItem,
  TripPlace,
} from "./types";

/**
 * The trip places that are not scheduled on any itinerary day.
 *
 * A place is unassigned when it exists in the trip's place pool but no
 * itinerary item references it. Scheduled places are checked by placeId, so a
 * place scheduled on multiple days is still considered assigned. The returned
 * list preserves the pool's ordering.
 */
export function unassignedTripPlaces(
  places: TripPlace[],
  items: ItineraryItem[]
): TripPlace[] {
  const scheduledPlaceIds = new Set(items.map((item) => item.placeId));
  return places.filter((place) => !scheduledPlaceIds.has(place.placeId));
}

/** Raw inputs consumed by the pure trip plan composer. */
export interface BuildTripPlanInput {
  trip: Trip;
  days: TripDay[];
  places: TripPlace[];
  items: ItineraryItem[];
}

/**
 * Order trip days by the existing calendar-date/day-number rules.
 * Day number is the canonical sequencing; date and id are deterministic
 * tie-breakers for days with a missing date.
 */
function compareTripDays(a: TripDay, b: TripDay): number {
  if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
  if (a.date !== b.date) return (a.date ?? "").localeCompare(b.date ?? "");
  return a.id.localeCompare(b.id);
}

/**
 * Deterministic, read-only composed representation of a complete trip.
 *
 * - Never mutates any input array or record.
 * - Orders days via the existing calendar-date/day-number rules.
 * - Orders each day's items via orderItineraryItems (timed first, then untimed).
 * - Preserves startTime, endTime, and notes on every item.
 * - Formats each item's time range and each day's label with existing helpers.
 */
export function buildTripPlan(input: BuildTripPlanInput): TripPlan {
  const orderedDays = input.days.slice().sort(compareTripDays);

  const days: TripPlanDay[] = orderedDays.map((day) => {
    const orderedItems = orderItineraryItems(
      input.items.filter((item) => item.tripDayId === day.id)
    );

    const items: TripPlanItem[] = orderedItems.map((item) => ({
      item,
      timeRange: formatTimeRange(item.startTime, item.endTime),
    }));

    return {
      dayNumber: day.dayNumber,
      calendarDate: day.date,
      label: formatTripDate(day.date),
      items,
      count: items.length,
      isEmpty: items.length === 0,
    };
  });

  return {
    trip: input.trip,
    places: input.places.slice(),
    days,
    totalItems: days.reduce((sum, day) => sum + day.count, 0),
    plannedDays: days.filter((day) => !day.isEmpty).length,
  };
}