import type {
  ItineraryItem,
  Trip,
  TripDay,
  TripPlace,
} from "@/lib/saved/types";

export type SmartSuggestionKind = "assign-unassigned" | "rebalance";

export interface SmartDaySuggestion {
  kind: SmartSuggestionKind;
  placeId: string;
  placeName: string;
  sourceDay: { id: string; dayNumber: number } | null;
  targetDay: { id: string; dayNumber: number } | null;
  reason: string;
  action: {
    type: "assign-place" | "move-item";
    placeId: string;
    itemId?: string;
    targetDayId: string;
  };
}

export interface SmartDaySuggestionsSummary {
  totalDays: number;
  plannedDays: number;
  emptyDays: number;
  unassignedPlaceCount: number;
}

export interface SmartDaySuggestionsResult {
  suggestions: SmartDaySuggestion[];
  summary: SmartDaySuggestionsSummary;
}

export interface SmartDaySuggestionsInput {
  trip: Trip;
  days: TripDay[];
  places: TripPlace[];
  items: ItineraryItem[];
}

export function computeSmartDaySuggestions(
  input: SmartDaySuggestionsInput
): SmartDaySuggestionsResult {
  const days = input.days ?? [];
  const places = input.places ?? [];
  const items = input.items ?? [];

  if (days.length === 0) {
    return {
      suggestions: [],
      summary: {
        totalDays: 0,
        plannedDays: 0,
        emptyDays: 0,
        unassignedPlaceCount: 0,
      },
    };
  }

  const dayIds = new Set(days.map((day) => day.id));
  const seenPlaceIds = new Set<string>();
  const pool: TripPlace[] = [];
  for (const place of places) {
    if (!seenPlaceIds.has(place.placeId)) {
      seenPlaceIds.add(place.placeId);
      pool.push(place);
    }
  }

  const assignedPlaceIds = new Set<string>();
  const itemsByDayId = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    if (item.placeId) assignedPlaceIds.add(item.placeId);
    if (!item.tripDayId || !dayIds.has(item.tripDayId)) continue;
    const list = itemsByDayId.get(item.tripDayId);
    if (list) list.push(item);
    else itemsByDayId.set(item.tripDayId, [item]);
  }

  const dayCounts = new Map<string, number>();
  for (const day of days) {
    dayCounts.set(day.id, itemsByDayId.get(day.id)?.length ?? 0);
  }

  const lightestDay = [...days].sort(
    (a, b) =>
      (dayCounts.get(a.id) ?? 0) - (dayCounts.get(b.id) ?? 0) ||
      a.dayNumber - b.dayNumber
  )[0];

  const suggestions: SmartDaySuggestion[] = [];

  for (const place of pool) {
    if (assignedPlaceIds.has(place.placeId)) continue;
    suggestions.push({
      kind: "assign-unassigned",
      placeId: place.placeId,
      placeName: place.placeName,
      sourceDay: null,
      targetDay: { id: lightestDay.id, dayNumber: lightestDay.dayNumber },
      reason: `${place.placeName} is not scheduled yet. Day ${
        lightestDay.dayNumber
      } currently has the fewest stops (${
        dayCounts.get(lightestDay.id) ?? 0
      }).`,
      action: {
        type: "assign-place",
        placeId: place.placeId,
        targetDayId: lightestDay.id,
      },
    });
  }

  const minDayCount = Math.min(...days.map((day) => dayCounts.get(day.id) ?? 0));

  for (const day of [...days].sort((a, b) => a.dayNumber - b.dayNumber)) {
    const count = dayCounts.get(day.id) ?? 0;
    if (count < 2 || count < minDayCount + 2) continue;
    if (lightestDay.id === day.id) continue;

    const orderedItems = (itemsByDayId.get(day.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    const targetPlaceIds = new Set(
      (itemsByDayId.get(lightestDay.id) ?? []).map((item) => item.placeId)
    );
    const candidate = orderedItems.find(
      (item) => !targetPlaceIds.has(item.placeId)
    );
    if (!candidate) continue;

    suggestions.push({
      kind: "rebalance",
      placeId: candidate.placeId,
      placeName: candidate.placeName,
      sourceDay: { id: day.id, dayNumber: day.dayNumber },
      targetDay: { id: lightestDay.id, dayNumber: lightestDay.dayNumber },
      reason: `Day ${day.dayNumber} has ${count} stops while Day ${
        lightestDay.dayNumber
      } only has ${
        dayCounts.get(lightestDay.id) ?? 0
      }. Move ${candidate.placeName} to spread the days out.`,
      action: {
        type: "move-item",
        placeId: candidate.placeId,
        itemId: candidate.id,
        targetDayId: lightestDay.id,
      },
    });
  }

  const plannedDays = [...days].filter(
    (day) => (dayCounts.get(day.id) ?? 0) > 0
  ).length;

  return {
    suggestions,
    summary: {
      totalDays: days.length,
      plannedDays,
      emptyDays: days.length - plannedDays,
      unassignedPlaceCount: pool.filter(
        (place) => !assignedPlaceIds.has(place.placeId)
      ).length,
    },
  };
}