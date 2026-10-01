import type { SpecificPlaceCategory, PriceLevel } from "@/lib/places/types";

// ---------------------------------------------------------------------------
// Core saved-place entity
// ---------------------------------------------------------------------------

/** A place that a user has bookmarked. Mirrors the `saved_places` DB table. */
export interface SavedPlace {
  id: string;
  userId: string;
  placeId: string;
  destinationSlug: string;
  placeName: string;
  placeCategory: SpecificPlaceCategory;
  placeImageUrl: string | null;
  placeRating: number | null;
  placePriceLevel: PriceLevel | null;
  placeAddress: string | null;
  createdAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Trip entities
// ---------------------------------------------------------------------------

export type TripStatus = "planning" | "upcoming" | "completed";

/** A user-created trip. Mirrors the `trips` DB table. */
export interface Trip {
  id: string;
  userId: string;
  title: string;
  destinationSlug: string;
  destinationName: string;
  description: string | null;
  startDate: string | null; // ISO 8601 date string
  endDate: string | null;   // ISO 8601 date string
  status: TripStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** A place added to a specific trip. Mirrors the `trip_places` DB table. */
export interface TripPlace {
  id: string;
  tripId: string;
  userId: string;
  placeId: string;
  destinationSlug: string;
  placeName: string;
  placeCategory: SpecificPlaceCategory;
  placeImageUrl: string | null;
  placeRating: number | null;
  placePriceLevel: PriceLevel | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Input types — Saved Places
// ---------------------------------------------------------------------------

/** Payload required to save a place for the current user. */
export interface SavePlaceInput {
  placeId: string;
  destinationSlug: string;
  placeName: string;
  placeCategory: SpecificPlaceCategory;
  placeImageUrl?: string | null;
  placeRating?: number | null;
  placePriceLevel?: PriceLevel | null;
  placeAddress?: string | null;
}

/** Payload required to remove a saved place. */
export interface RemoveSavedPlaceInput {
  placeId: string;
  destinationSlug: string;
}

// ---------------------------------------------------------------------------
// Input types — Trips
// ---------------------------------------------------------------------------

/** Payload required to create a new trip. */
export interface CreateTripInput {
  title: string;
  destinationSlug: string;
  destinationName: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: TripStatus;
}

/** Payload for partial updates to an existing trip. */
export interface UpdateTripInput {
  title?: string;
  destinationName?: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: TripStatus;
}

// ---------------------------------------------------------------------------
// Input types — Trip Places
// ---------------------------------------------------------------------------

/** Payload required to add a place to a trip. */
export interface AddPlaceToTripInput {
  tripId: string;
  placeId: string;
  destinationSlug: string;
  placeName: string;
  placeCategory: SpecificPlaceCategory;
  placeImageUrl?: string | null;
  placeRating?: number | null;
  placePriceLevel?: PriceLevel | null;
  notes?: string | null;
  sortOrder?: number;
}

/** Payload required to remove a place from a trip. */
export interface RemovePlaceFromTripInput {
  tripId: string;
  placeId: string;
}

// ---------------------------------------------------------------------------
// Trip itinerary entities
// ---------------------------------------------------------------------------

/** A single day of a trip's itinerary. Mirrors the `trip_days` DB table. */
export interface TripDay {
  id: string;
  tripId: string;
  userId: string;
  dayNumber: number;
  date: string | null; // ISO 8601 date string
  createdAt: string; // ISO 8601
}

/** A place assigned to a specific trip day. Mirrors the `itinerary_items` DB table. */
export interface ItineraryItem {
  id: string;
  tripId: string;
  tripDayId: string;
  userId: string;
  placeId: string;
  placeName: string;
  placeCategory: SpecificPlaceCategory;
  placeImageUrl: string | null;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Input types — Trip Itinerary
// ---------------------------------------------------------------------------

/** Payload required to add a trip place to a specific itinerary day. */
export interface AddItineraryItemInput {
  tripId: string;
  tripDayId: string;
  placeId: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
}

/** Payload required to remove an item from an itinerary day. */
export interface RemoveItineraryItemInput {
  tripId: string;
  tripDayId: string;
  itemId: string;
}

/** Payload required to update an item's time slots and notes. */
export interface UpdateItineraryItemInput {
  tripId: string;
  tripDayId: string;
  itemId: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
}

/** Payload required to move an item from one trip day to another. */
export interface MoveItineraryItemInput {
  tripId: string;
  itemId: string;
  toTripDayId: string;
}

// ---------------------------------------------------------------------------
// Trip plan snapshot — read-only composed view of a complete trip
// ---------------------------------------------------------------------------

/** An itinerary item within a trip plan, paired with its formatted time range. */
export interface TripPlanItem {
  item: ItineraryItem;
  /** Formatted "HH:MM" times, e.g. "10:00 AM – 12:00 PM". Null when no valid time is set. */
  timeRange: string | null;
}

/** A single ordered day within a trip plan snapshot. */
export interface TripPlanDay {
  dayNumber: number;
  /** ISO 8601 date string, or null when the day has no calendar date. */
  calendarDate: string | null;
  /** Display label via the existing trip-date formatting, e.g. "Mar 3, 2026". */
  label: string;
  /** Itinerary items in deterministic display order. */
  items: TripPlanItem[];
  /** Number of items on this day. */
  count: number;
  /** True when the day has no planned items. */
  isEmpty: boolean;
}

/** Deterministic, read-only composed representation of a user's complete trip. */
export interface TripPlan {
  trip: Trip;
  /** Places added to the trip (the pool itinerary items are drawn from). */
  places: TripPlace[];
  /** Days ordered by the existing calendar-date/day-number rules. */
  days: TripPlanDay[];
  /** Total itinerary items across all days. */
  totalItems: number;
  /** Number of days that contain at least one planned item. */
  plannedDays: number;
}

// ---------------------------------------------------------------------------
// Trip plan report — deterministic itinerary consistency analysis
// ---------------------------------------------------------------------------

export type TripPlanIssueCode =
  | "inverted-time-range"
  | "day-outside-trip"
  | "duplicate-place-cross-day"
  | "overlapping-times"
  | "empty-day"
  | "unassigned-place";

export type TripPlanIssueSeverity = "error" | "warning" | "info";

/** A single deterministic consistency finding about a trip plan. */
export interface TripPlanIssue {
  code: TripPlanIssueCode;
  severity: TripPlanIssueSeverity;
  message: string;
  /** Day number when the issue concerns a specific day. */
  dayNumber?: number;
  /** Primary itinerary item when the issue concerns one (or the earlier of a pair). */
  itemId?: string;
  /** Place id when the issue concerns a place or item. */
  placeId?: string;
}

/** Aggregate counters describing a trip plan's consistency. */
export interface TripPlanReportSummary {
  totalDays: number;
  plannedDays: number;
  emptyDays: number;
  totalItems: number;
  /** Trip places that appear in no itinerary day. */
  unassignedPlaceCount: number;
  issueCount: number;
}

/** Read-only result of analyzing a trip plan for itinerary consistency. */
export interface TripPlanReport {
  tripId: string;
  summary: TripPlanReportSummary;
  issues: TripPlanIssue[];
}
