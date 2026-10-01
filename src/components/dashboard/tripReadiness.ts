import type { ItineraryItem, Trip, TripDay, TripPlace } from "@/lib/saved/types";

export type TripReadinessStatus =
  | "getting-started"
  | "in-progress"
  | "almost-ready"
  | "ready";

export const TRIP_READINESS_STATUS_LABEL: Record<TripReadinessStatus, string> = {
  "getting-started": "Getting started",
  "in-progress": "In progress",
  "almost-ready": "Almost ready",
  ready: "Ready",
};

export interface TripReadinessChecklistItem {
  kind: "done" | "todo";
  label: string;
}

export interface TripReadinessSummary {
  status: TripReadinessStatus;
  statusLabel: string;
  /** Preparation progress from 0 to 100, derived only from trip planning data. */
  score: number;
  totalDays: number;
  plannedDays: number;
  emptyDays: number;
  placesAdded: number;
  assignedPlaceCount: number;
  unassignedPlaceCount: number;
  itineraryItemCount: number;
  timedItemCount: number;
  untimedItemCount: number;
  conciseSummary: string;
  checklist: TripReadinessChecklistItem[];
}

export interface TripReadinessInput {
  trip: Trip;
  days: readonly TripDay[];
  places: readonly TripPlace[];
  items: readonly ItineraryItem[];
}

function clampedRatio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(1, part / whole);
}

function label(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function computeTripReadiness(input: TripReadinessInput): TripReadinessSummary {
  const { trip, days, places, items } = input;
  const datesSet = Boolean(trip.startDate && trip.endDate);

  const plannedDayIds = new Set<string>();
  const scheduledPlaceIds = new Set<string>();
  for (const item of items) {
    plannedDayIds.add(item.tripDayId);
    scheduledPlaceIds.add(item.placeId);
  }

  const plannedDays = days.filter((day) => plannedDayIds.has(day.id)).length;
  const emptyDays = days.length - plannedDays;

  const placesAdded = places.length;
  const assignedPlaceCount = scheduledPlaceIds.size;
  const poolPlaceIds = [...new Set(places.map((place) => place.placeId))];
  const unassignedPlaceCount = poolPlaceIds.filter(
    (placeId) => !scheduledPlaceIds.has(placeId)
  ).length;

  const itineraryItemCount = items.length;
  const timedItemCount = items.filter(
    (item) => item.startTime && item.endTime
  ).length;
  const untimedItemCount = itineraryItemCount - timedItemCount;

  const dates = datesSet ? 30 : 0;
  const placesScored = placesAdded > 0 ? 15 : 0;
  const daysScored = Math.round(30 * clampedRatio(plannedDays, days.length));
  const assignedScored = Math.round(15 * clampedRatio(assignedPlaceCount, placesAdded));
  const timedScored = Math.round(10 * clampedRatio(timedItemCount, itineraryItemCount));

  let score = dates + placesScored + daysScored + assignedScored + timedScored;
  if (!datesSet) {
    score = Math.min(score, 24);
  } else if (placesAdded === 0) {
    score = Math.min(score, 59);
  }

  const status: TripReadinessStatus =
    score >= 90
      ? "ready"
      : score >= 60
        ? "almost-ready"
        : score >= 25
          ? "in-progress"
          : "getting-started";

  const checklist: TripReadinessChecklistItem[] = [];
  checklist.push(
    datesSet
      ? { kind: "done", label: "Trip dates are set" }
      : { kind: "todo", label: "Set this trip's start and end dates" }
  );
  checklist.push(
    placesAdded > 0
      ? { kind: "done", label: `${label(placesAdded, "place")} added` }
      : { kind: "todo", label: "Add places to this trip" }
  );
  if (days.length > 0) {
    checklist.push(
      emptyDays === 0
        ? { kind: "done", label: "Every day has an activity" }
        : emptyDays === 1
          ? { kind: "todo", label: "1 day still needs an activity" }
          : { kind: "todo", label: `${emptyDays} days still need activities` }
    );
  }
  if (placesAdded > 0) {
    checklist.push(
      unassignedPlaceCount === 0
        ? { kind: "done", label: "Every place is assigned to a day" }
        : unassignedPlaceCount === 1
          ? { kind: "todo", label: "1 place is still unassigned" }
          : { kind: "todo", label: `${unassignedPlaceCount} places are still unassigned` }
    );
  }
  if (itineraryItemCount > 0) {
    checklist.push(
      untimedItemCount === 0
        ? { kind: "done", label: "Every stop has a time set" }
        : untimedItemCount === 1
          ? { kind: "todo", label: "1 stop is missing a time" }
          : { kind: "todo", label: `${untimedItemCount} stops are missing times` }
    );
  }

  const parts = [
    `${plannedDays} of ${label(days.length, "day")} planned`,
  ];
  if (placesAdded > 0) {
    parts.push(`${assignedPlaceCount} of ${label(placesAdded, "place")} assigned`);
  }
  if (untimedItemCount > 0) {
    parts.push(`${label(untimedItemCount, "stop")} missing a time`);
  }

  return {
    status,
    statusLabel: TRIP_READINESS_STATUS_LABEL[status],
    score,
    totalDays: days.length,
    plannedDays,
    emptyDays,
    placesAdded,
    assignedPlaceCount,
    unassignedPlaceCount,
    itineraryItemCount,
    timedItemCount,
    untimedItemCount,
    conciseSummary: parts.join(" · "),
    checklist,
  };
}