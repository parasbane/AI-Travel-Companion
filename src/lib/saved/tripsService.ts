import type {
  Trip,
  TripPlace,
  CreateTripInput,
  UpdateTripInput,
  AddPlaceToTripInput,
  RemovePlaceFromTripInput,
  TripStatus,
  TripDay,
  ItineraryItem,
  AddItineraryItemInput,
  RemoveItineraryItemInput,
  UpdateItineraryItemInput,
  MoveItineraryItemInput,
  TripPlan,
  TripPlanReport,
} from "@/lib/saved/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { buildTripDates, reconcileTripDates } from "@/lib/saved/tripDates";
import { buildTripPlan } from "@/lib/saved/tripPlan";
import { analyzeTripPlan } from "@/lib/saved/tripPlanReport";
import type { PlanApplicationAddition } from "@/lib/ai/applyItineraryPlan";

// ---------------------------------------------------------------------------
// Local ID generation — Date.now() alone can collide within the same millisecond
// ---------------------------------------------------------------------------

let localIdCounter = 0;

function nextLocalId(prefix: string): string {
  localIdCounter += 1;
  return `${prefix}_${Date.now()}_${localIdCounter}`;
}

// ---------------------------------------------------------------------------
// localStorage key helpers — always user-scoped, never shared between users
// ---------------------------------------------------------------------------

function localTripsKey(userId: string): string {
  return `ai_travel_trips_${userId}`;
}

function localTripPlacesKey(userId: string): string {
  return `ai_travel_trip_places_${userId}`;
}

function readLocalTrips(userId: string): Trip[] {
  try {
    const raw = localStorage.getItem(localTripsKey(userId));
    return raw ? (JSON.parse(raw) as Trip[]) : [];
  } catch {
    return [];
  }
}

function writeLocalTrips(userId: string, items: Trip[]): void {
  try {
    localStorage.setItem(localTripsKey(userId), JSON.stringify(items));
  } catch {}
}

function readLocalTripPlaces(userId: string): TripPlace[] {
  try {
    const raw = localStorage.getItem(localTripPlacesKey(userId));
    return raw ? (JSON.parse(raw) as TripPlace[]) : [];
  } catch {
    return [];
  }
}

function writeLocalTripPlaces(userId: string, items: TripPlace[]): void {
  try {
    localStorage.setItem(localTripPlacesKey(userId), JSON.stringify(items));
  } catch {}
}

// ---------------------------------------------------------------------------
// Local storage helpers — trip days and itinerary items
// ---------------------------------------------------------------------------

function localTripDaysKey(userId: string): string {
  return `ai_travel_trip_days_${userId}`;
}

function readLocalTripDays(userId: string): TripDay[] {
  try {
    const raw = localStorage.getItem(localTripDaysKey(userId));
    return raw ? (JSON.parse(raw) as TripDay[]) : [];
  } catch {
    return [];
  }
}

function writeLocalTripDays(userId: string, items: TripDay[]): void {
  try {
    localStorage.setItem(localTripDaysKey(userId), JSON.stringify(items));
  } catch {}
}

function localItineraryKey(userId: string): string {
  return `ai_travel_itinerary_items_${userId}`;
}

function readLocalItineraryItems(userId: string): ItineraryItem[] {
  try {
    const raw = localStorage.getItem(localItineraryKey(userId));
    return raw ? (JSON.parse(raw) as ItineraryItem[]) : [];
  } catch {
    return [];
  }
}

function writeLocalItineraryItems(userId: string, items: ItineraryItem[]): void {
  try {
    localStorage.setItem(localItineraryKey(userId), JSON.stringify(items));
  } catch {}
}

// ---------------------------------------------------------------------------
// Authentication — the authenticated Supabase user is the source of truth.
// A client-provided userId is never trusted until it matches the session.
// ---------------------------------------------------------------------------

async function getAuthenticatedUserId(userId: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || user.id !== userId) {
    throw new Error("Must be signed in to manage trips");
  }

  return user.id;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const VALID_STATUSES: TripStatus[] = ["planning", "upcoming", "completed"];

function validateCreateTripInput(input: CreateTripInput): string | null {
  const title = input.title?.trim();
  if (!title) return "Trip title is required";
  if (title.length > 100) return "Trip title must be 100 characters or fewer";
  if (!input.destinationSlug?.trim()) return "destinationSlug is required";
  if (!input.destinationName?.trim()) return "destinationName is required";
  if (input.status && !VALID_STATUSES.includes(input.status))
    return `status must be one of: ${VALID_STATUSES.join(", ")}`;
  if (input.startDate && input.endDate && input.endDate < input.startDate)
    return "endDate must be on or after startDate";
  return null;
}

function validateUpdateTripInput(input: UpdateTripInput): string | null {
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) return "Trip title cannot be empty";
    if (title.length > 100) return "Trip title must be 100 characters or fewer";
  }
  if (input.status && !VALID_STATUSES.includes(input.status))
    return `status must be one of: ${VALID_STATUSES.join(", ")}`;
  if (input.startDate && input.endDate && input.endDate < input.startDate)
    return "endDate must be on or after startDate";
  return null;
}

function validateAddPlaceToTripInput(input: AddPlaceToTripInput): string | null {
  if (!input.tripId?.trim()) return "tripId is required";
  if (!input.placeId?.trim()) return "placeId is required";
  if (!input.destinationSlug?.trim()) return "destinationSlug is required";
  if (!input.placeName?.trim()) return "placeName is required";
  if (!input.placeCategory) return "placeCategory is required";
  return null;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_ITEM_NOTES_LENGTH = 500;

/** Validate optional "HH:MM" times and reject ranges where start is after end. */
function validateItineraryTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined
): string | null {
  if (startTime && !TIME_PATTERN.test(startTime))
    return "startTime must be in HH:MM format";
  if (endTime && !TIME_PATTERN.test(endTime))
    return "endTime must be in HH:MM format";
  if (startTime && endTime && endTime < startTime)
    return "startTime must be on or before endTime";
  return null;
}

// ---------------------------------------------------------------------------
// Trips API
// ---------------------------------------------------------------------------

export async function getTrips(userId: string): Promise<Trip[]> {
  if (!userId) return [];

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("user_id", authenticatedUserId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTripRow);
  }

  return readLocalTrips(userId);
}

/** Backwards-compatible name for callers using the original service API. */
export const listTrips = getTrips;

/** Load a single trip owned by the user, or null when it does not exist. */
export async function getTrip(
  userId: string,
  tripId: string
): Promise<Trip | null> {
  if (!userId || !tripId) return null;

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapTripRow(data) : null;
  }

  return (
    readLocalTrips(userId).find(
      (t) => t.id === tripId && t.userId === userId
    ) ?? null
  );
}

export async function createTrip(
  userId: string,
  input: CreateTripInput
): Promise<Trip> {
  if (!userId) throw new Error("Must be signed in to create a trip");

  const err = validateCreateTripInput(input);
  if (err) throw new Error(err);

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trips")
      .insert({
        user_id: authenticatedUserId,
        title: input.title.trim(),
        destination_slug: input.destinationSlug,
        destination_name: input.destinationName,
        description: input.description ?? null,
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
        status: input.status ?? "planning",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapTripRow(data);
  }

  const now = new Date().toISOString();
  const newTrip: Trip = {
    id: nextLocalId("local_trip"),
    userId,
    title: input.title.trim(),
    destinationSlug: input.destinationSlug,
    destinationName: input.destinationName,
    description: input.description ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    status: input.status ?? "planning",
    createdAt: now,
    updatedAt: now,
  };

  const existing = readLocalTrips(userId);
  writeLocalTrips(userId, [newTrip, ...existing]);
  return newTrip;
}

export async function updateTrip(
  userId: string,
  tripId: string,
  input: UpdateTripInput
): Promise<Trip> {
  if (!userId) throw new Error("Must be signed in");
  if (!tripId) throw new Error("tripId is required");

  const err = validateUpdateTripInput(input);
  if (err) throw new Error(err);

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.destinationName !== undefined) patch.destination_name = input.destinationName;
    if (input.description !== undefined) patch.description = input.description;
    if (input.startDate !== undefined) patch.start_date = input.startDate;
    if (input.endDate !== undefined) patch.end_date = input.endDate;
    if (input.status !== undefined) patch.status = input.status;

    const { data, error } = await supabase
      .from("trips")
      .update(patch)
      .eq("id", tripId)
      .eq("user_id", authenticatedUserId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapTripRow(data);
  }

  const existing = readLocalTrips(userId);
  const idx = existing.findIndex((t) => t.id === tripId && t.userId === userId);
  if (idx === -1) throw new Error("Trip not found");

  const updated: Trip = {
    ...existing[idx],
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.destinationName !== undefined ? { destinationName: input.destinationName } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    updatedAt: new Date().toISOString(),
  };

  existing[idx] = updated;
  writeLocalTrips(userId, existing);
  return updated;
}

export async function deleteTrip(userId: string, tripId: string): Promise<void> {
  if (!userId) throw new Error("Must be signed in");
  if (!tripId) throw new Error("tripId is required");

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { error } = await supabase
      .from("trips")
      .delete()
      .eq("id", tripId)
      .eq("user_id", authenticatedUserId);
    if (error) throw new Error(error.message);
    return;
  }

  const trips = readLocalTrips(userId);
  writeLocalTrips(userId, trips.filter((t) => t.id !== tripId));

  // Also remove associated trip places
  const places = readLocalTripPlaces(userId);
  writeLocalTripPlaces(userId, places.filter((p) => p.tripId !== tripId));

  // local storage parity with Supabase FK cascades: days and their itinerary
  // items must not be left orphaned behind a deleted trip.
  writeLocalTripDays(
    userId,
    readLocalTripDays(userId).filter((d) => d.tripId !== tripId)
  );
  writeLocalItineraryItems(
    userId,
    readLocalItineraryItems(userId).filter((i) => i.tripId !== tripId)
  );
}

// ---------------------------------------------------------------------------
// Trip Places API
// ---------------------------------------------------------------------------

export async function getTripPlaces(
  userId: string,
  tripId: string
): Promise<TripPlace[]> {
  if (!userId || !tripId) return [];

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trip_places")
      .select("*")
      .eq("trip_id", tripId)
      .eq("user_id", authenticatedUserId)
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTripPlaceRow);
  }

  return readLocalTripPlaces(userId).filter((p) => p.tripId === tripId);
}

/** Backwards-compatible name for callers using the original service API. */
export const listTripPlaces = getTripPlaces;

export async function addPlaceToTrip(
  userId: string,
  input: AddPlaceToTripInput
): Promise<TripPlace> {
  if (!userId) throw new Error("Must be signed in");

  const err = validateAddPlaceToTripInput(input);
  if (err) throw new Error(err);

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trip_places")
      .upsert(
        {
          trip_id: input.tripId,
          user_id: authenticatedUserId,
          place_id: input.placeId,
          destination_slug: input.destinationSlug,
          place_name: input.placeName,
          place_category: input.placeCategory,
          place_image_url: input.placeImageUrl ?? null,
          place_rating: input.placeRating ?? null,
          place_price_level: input.placePriceLevel ?? null,
          notes: input.notes ?? null,
          sort_order: input.sortOrder ?? 0,
        },
        { onConflict: "trip_id,place_id", ignoreDuplicates: false }
      )
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapTripPlaceRow(data);
  }

  const existing = readLocalTripPlaces(userId);
  const duplicate = existing.find(
    (p) => p.tripId === input.tripId && p.placeId === input.placeId
  );
  if (duplicate) return duplicate;

  const newItem: TripPlace = {
    id: nextLocalId("local_tp"),
    tripId: input.tripId,
    userId,
    placeId: input.placeId,
    destinationSlug: input.destinationSlug,
    placeName: input.placeName,
    placeCategory: input.placeCategory,
    placeImageUrl: input.placeImageUrl ?? null,
    placeRating: input.placeRating ?? null,
    placePriceLevel: input.placePriceLevel ?? null,
    notes: input.notes ?? null,
    sortOrder: input.sortOrder ?? existing.filter((p) => p.tripId === input.tripId).length,
    createdAt: new Date().toISOString(),
  };

  writeLocalTripPlaces(userId, [...existing, newItem]);
  return newItem;
}

export async function removePlaceFromTrip(
  userId: string,
  input: RemovePlaceFromTripInput
): Promise<void> {
  if (!userId) throw new Error("Must be signed in");
  if (!input.tripId?.trim()) throw new Error("tripId is required");
  if (!input.placeId?.trim()) throw new Error("placeId is required");

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();

    // itinerary_items has no FK to trip_places, so remove the place's
    // scheduled entries explicitly before dropping it from the pool. This
    // keeps the Supabase and localStorage paths behaviorally identical.
    const { error: itemsError } = await supabase
      .from("itinerary_items")
      .delete()
      .eq("trip_id", input.tripId)
      .eq("place_id", input.placeId)
      .eq("user_id", authenticatedUserId);
    if (itemsError) throw new Error(itemsError.message);

    const { error } = await supabase
      .from("trip_places")
      .delete()
      .eq("trip_id", input.tripId)
      .eq("place_id", input.placeId)
      .eq("user_id", authenticatedUserId);

    if (error) throw new Error(error.message);
    return;
  }

  const existing = readLocalTripPlaces(userId);
  writeLocalTripPlaces(
    userId,
    existing.filter(
      (p) => !(p.tripId === input.tripId && p.placeId === input.placeId)
    )
  );

  // Also remove the place's scheduled itinerary entries.
  writeLocalItineraryItems(
    userId,
    readLocalItineraryItems(userId).filter(
      (i) => !(i.tripId === input.tripId && i.placeId === input.placeId)
    )
  );
}

// ---------------------------------------------------------------------------
// Trip Itinerary API
// ---------------------------------------------------------------------------

/** Load a trip's days ordered by day number. */
export async function getTripDays(
  userId: string,
  tripId: string
): Promise<TripDay[]> {
  if (!userId || !tripId) return [];

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trip_days")
      .select("*")
      .eq("trip_id", tripId)
      .eq("user_id", authenticatedUserId)
      .order("day_number", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTripDayRow);
  }

  return readLocalTripDays(userId)
    .filter((d) => d.tripId === tripId)
    .sort((a, b) => a.dayNumber - b.dayNumber);
}

/**
 * Ensure a trip has one day per calendar day in its start→end range.
 * Idempotent: existing days are left untouched, missing days are created.
 */
export async function createTripDays(
  userId: string,
  tripId: string
): Promise<TripDay[]> {
  if (!userId) throw new Error("Must be signed in");
  if (!tripId) throw new Error("tripId is required");

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();

    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("start_date, end_date")
      .eq("id", tripId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (tripError) throw new Error(tripError.message);
    if (!trip) throw new Error("Trip not found");

    const dateList = buildTripDates(trip.start_date, trip.end_date);
    if (dateList === null) return [];

    const rows = dateList.map((date, index) => ({
      trip_id: tripId,
      user_id: authenticatedUserId,
      day_number: index + 1,
      date,
    }));

    const { error } = await supabase
      .from("trip_days")
      .upsert(rows, { onConflict: "trip_id,day_number", ignoreDuplicates: true });

    if (error) throw new Error(error.message);

    return getTripDays(userId, tripId);
  }

  const trip = readLocalTrips(userId).find((t) => t.id === tripId);
  if (!trip) throw new Error("Trip not found");

  const dateList = buildTripDates(trip.startDate, trip.endDate);
  if (dateList === null) return [];

  const existing = readLocalTripDays(userId);
  const existingForTrip = existing.filter((d) => d.tripId === tripId);

  const now = new Date().toISOString();
  const newDays: TripDay[] = [];
  for (let i = 0; i < dateList.length; i += 1) {
    const dayNumber = i + 1;
    if (existingForTrip.some((d) => d.dayNumber === dayNumber)) continue;
    newDays.push({
      id: nextLocalId(`local_trip_day`),
      tripId,
      userId,
      dayNumber,
      date: dateList[i],
      createdAt: now,
    });
  }

  writeLocalTripDays(userId, [...existing, ...newDays]);
  return getTripDays(userId, tripId);
}

/**
 * Reconcile a trip's trip_days so they exactly match its current start/end
 * date range. Idempotent — running it repeatedly with the same dates never
 * creates or removes extra days.
 *
 * - Loads the trip through getTrip, so ownership is enforced exactly like the
 *   rest of the trip API and other users can never inspect or mutate days.
 * - Trips without a valid date range are a safe no-op (days left untouched).
 * - Creates any missing days, removes days that now fall outside the range,
 *   and renumbers the remaining days to 1..N in date order so day numbers
 *   always mirror the range.
 * - Removing a day also removes its itinerary items (FK cascade in Supabase;
 *   explicit pruning in local storage). Items on days that remain are kept.
 * - Behaves consistently in both Supabase and localStorage modes.
 */
export async function reconcileTripDays(
  userId: string,
  tripId: string
): Promise<TripDay[]> {
  if (!userId) throw new Error("Must be signed in");
  if (!tripId) throw new Error("tripId is required");

  const trip = await getTrip(userId, tripId);
  if (!trip) throw new Error("Trip not found");

  const days = await getTripDays(userId, tripId);
  const reconciliation = reconcileTripDates(
    trip.startDate,
    trip.endDate,
    days.map((day) => day.date)
  );
  if (reconciliation === null) return days;

  const outOfRangeDayIds = new Set(
    days
      .filter(
        (day) => day.date && reconciliation.outOfRange.includes(day.date)
      )
      .map((day) => day.id)
  );
  for (const dayId of outOfRangeDayIds) {
    await removeTripDay(userId, tripId, dayId);
  }

  const remaining = await getTripDays(userId, tripId);
  const maxDayNumber = remaining.reduce(
    (max, day) => Math.max(max, day.dayNumber),
    0
  );
  for (let index = 0; index < reconciliation.missing.length; index += 1) {
    await insertTripDay(
      userId,
      tripId,
      reconciliation.missing[index],
      maxDayNumber + index + 1
    );
  }

  await renumberTripDays(userId, tripId);

  return getTripDays(userId, tripId);
}

/** Delete a trip day, removing its itinerary items along with it. */
async function removeTripDay(
  userId: string,
  tripId: string,
  tripDayId: string
): Promise<void> {
  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { error } = await supabase
      .from("trip_days")
      .delete()
      .eq("id", tripDayId)
      .eq("trip_id", tripId)
      .eq("user_id", authenticatedUserId);

    if (error) throw new Error(error.message);
    return;
  }

  writeLocalTripDays(
    userId,
    readLocalTripDays(userId).filter(
      (day) => !(day.id === tripDayId && day.tripId === tripId)
    )
  );
  writeLocalItineraryItems(
    userId,
    readLocalItineraryItems(userId).filter((item) => item.tripDayId !== tripDayId)
  );
}

/** Insert a day for a date, skipping it when the day already exists. */
async function insertTripDay(
  userId: string,
  tripId: string,
  date: string,
  dayNumber: number
): Promise<void> {
  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { error } = await supabase
      .from("trip_days")
      .upsert(
        {
          trip_id: tripId,
          user_id: authenticatedUserId,
          day_number: dayNumber,
          date,
        },
        { onConflict: "trip_id,day_number", ignoreDuplicates: true }
      );

    if (error) throw new Error(error.message);
    return;
  }

  const existing = readLocalTripDays(userId);
  const alreadyExists = existing.some(
    (day) =>
      (day.tripId === tripId && day.dayNumber === dayNumber) ||
      (day.tripId === tripId && day.date === date)
  );
  if (alreadyExists) return;

  writeLocalTripDays(userId, [
    ...existing,
    {
      id: nextLocalId("local_trip_day"),
      tripId,
      userId,
      dayNumber,
      date,
      createdAt: new Date().toISOString(),
    },
  ]);
}

/**
 * Renumber a trip's days to contiguous 1..N ordering by calendar date.
 * Supabase applies the change in two phases so no update can collide with the
 * (trip_id, day_number) unique constraint.
 */
async function renumberTripDays(
  userId: string,
  tripId: string
): Promise<void> {
  const days = await getTripDays(userId, tripId);
  const ordered = days.slice().sort((a, b) => {
    const aDate = a.date ?? "\uFFFF";
    const bDate = b.date ?? "\uFFFF";
    if (aDate !== bDate) return aDate < bDate ? -1 : 1;
    if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
    return a.id.localeCompare(b.id);
  });

  if (
    ordered.every((day, index) => day.dayNumber === index + 1)
  ) {
    return;
  }

  const targets = ordered.map((day, index) => ({
    id: day.id,
    dayNumber: index + 1,
  }));

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();

    const shifted = await Promise.all(
      ordered.map((day) =>
        supabase
          .from("trip_days")
          .update({ day_number: day.dayNumber + 10_000 })
          .eq("id", day.id)
          .eq("user_id", authenticatedUserId)
      )
    );
    for (const result of shifted) {
      if (result.error) throw new Error(result.error.message);
    }

    const finalized = await Promise.all(
      targets.map((target) =>
        supabase
          .from("trip_days")
          .update({ day_number: target.dayNumber })
          .eq("id", target.id)
          .eq("user_id", authenticatedUserId)
      )
    );
    for (const result of finalized) {
      if (result.error) throw new Error(result.error.message);
    }
    return;
  }

  const all = readLocalTripDays(userId);
  const targetById = new Map(targets.map((target) => [target.id, target.dayNumber]));
  writeLocalTripDays(
    userId,
    all.map((day) => {
      const target = targetById.get(day.id);
      return target === undefined ? day : { ...day, dayNumber: target };
    })
  );
}

/** Load a trip's itinerary items ordered by (sort_order, created_at). */
export async function getItineraryItems(
  userId: string,
  tripId: string
): Promise<ItineraryItem[]> {
  if (!userId || !tripId) return [];

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", tripId)
      .eq("user_id", authenticatedUserId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapItineraryItemRow);
  }

  return readLocalItineraryItems(userId)
    .filter((i) => i.tripId === tripId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Load a deterministic, read-only snapshot of a complete trip:
 * trip + places + ordered days + ordered itinerary items + times + notes.
 * Returns null when the trip does not exist for the authenticated user.
 * Never modifies stored data.
 */
export async function getTripPlan(
  userId: string,
  tripId: string
): Promise<TripPlan | null> {
  if (!userId) throw new Error("Must be signed in to manage trips");
  if (!tripId) return null;

  const trip = await getTrip(userId, tripId);
  if (!trip) return null;

  const [places, days, items] = await Promise.all([
    getTripPlaces(userId, tripId),
    getTripDays(userId, tripId),
    getItineraryItems(userId, tripId),
  ]);

  return buildTripPlan({ trip, days, places, items });
}

/**
 * Analyze a trip's itinerary for consistency, wrapping the read-only
 * snapshot with the same auth and ownership behavior as getTripPlan.
 *
 * - Reuses getTripPlan exactly, so ownership and storage-path parity are
 *   structurally identical.
 * - Returns null when the trip does not exist for the authenticated user.
 * - Purely read-only: never writes to Supabase or localStorage.
 */
export async function getTripPlanReport(
  userId: string,
  tripId: string
): Promise<TripPlanReport | null> {
  if (!userId) throw new Error("Must be signed in to manage trips");
  if (!tripId) return null;

  const plan = await getTripPlan(userId, tripId);
  if (!plan) return null;

  return analyzeTripPlan(plan);
}

/**
 * Assign a place that already belongs to the trip to a trip day.
 * Rejects places not on the trip, days from another trip, and duplicate
 * assignment of the same place to the same day.
 */
export async function addPlaceToItinerary(
  userId: string,
  input: AddItineraryItemInput
): Promise<ItineraryItem> {
  if (!userId) throw new Error("Must be signed in");
  if (!input.tripId?.trim()) throw new Error("tripId is required");
  if (!input.tripDayId?.trim()) throw new Error("tripDayId is required");
  if (!input.placeId?.trim()) throw new Error("placeId is required");

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();

    // Place must belong to this trip (also enforces trip ownership).
    const { data: tripPlace, error: tripPlaceError } = await supabase
      .from("trip_places")
      .select("*")
      .eq("trip_id", input.tripId)
      .eq("place_id", input.placeId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (tripPlaceError) throw new Error(tripPlaceError.message);
    if (!tripPlace) throw new Error("Place must be added to the trip first");

    // Trip day must belong to the same trip.
    const { data: tripDay, error: tripDayError } = await supabase
      .from("trip_days")
      .select("id")
      .eq("id", input.tripDayId)
      .eq("trip_id", input.tripId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (tripDayError) throw new Error(tripDayError.message);
    if (!tripDay) throw new Error("Trip day does not belong to this trip");

    // Next sort order within the day.
    const { data: maxItem } = await supabase
      .from("itinerary_items")
      .select("sort_order")
      .eq("trip_day_id", input.tripDayId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = (maxItem?.sort_order ?? -1) + 1;

    // Idempotent: an existing assignment for this day + place is returned as-is.
    const { data: duplicate } = await supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_day_id", input.tripDayId)
      .eq("place_id", input.placeId)
      .maybeSingle();
    if (duplicate) return mapItineraryItemRow(duplicate);

    const { data, error } = await supabase
      .from("itinerary_items")
      .insert({
        trip_id: input.tripId,
        trip_day_id: input.tripDayId,
        user_id: authenticatedUserId,
        place_id: tripPlace.place_id,
        place_name: tripPlace.place_name,
        place_category: tripPlace.place_category,
        place_image_url: tripPlace.place_image_url ?? null,
        start_time: input.startTime ?? null,
        end_time: input.endTime ?? null,
        notes: input.notes ?? null,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapItineraryItemRow(data);
  }

  // Local fallback — mirror the Supabase validation path.
  const tripPlace = readLocalTripPlaces(userId).find(
    (p) => p.tripId === input.tripId && p.placeId === input.placeId
  );
  if (!tripPlace) throw new Error("Place must be added to the trip first");

  const tripDay = readLocalTripDays(userId).find(
    (d) => d.id === input.tripDayId && d.tripId === input.tripId
  );
  if (!tripDay) throw new Error("Trip day does not belong to this trip");

  const existing = readLocalItineraryItems(userId);
  const duplicate = existing.find(
    (i) => i.tripDayId === input.tripDayId && i.placeId === input.placeId
  );
  if (duplicate) return duplicate;

  const dayItems = existing
    .filter((i) => i.tripDayId === input.tripDayId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const nextSortOrder = dayItems.length;

  const newItem: ItineraryItem = {
    id: nextLocalId("local_itinerary"),
    tripId: input.tripId,
    tripDayId: input.tripDayId,
    userId,
    placeId: tripPlace.placeId,
    placeName: tripPlace.placeName,
    placeCategory: tripPlace.placeCategory,
    placeImageUrl: tripPlace.placeImageUrl ?? null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    notes: input.notes ?? null,
    sortOrder: nextSortOrder,
    createdAt: new Date().toISOString(),
  };

  writeLocalItineraryItems(userId, [...existing, newItem]);
  return newItem;
}

/**
 * Persist the additive part of an AI itinerary plan. Never deletes or rewrites
 * existing scheduled items:
 * - Reconciles the trip's days first so the referenced trip days exist, exactly
 *   like the itinerary load path (createTripDays).
 * - Adds each suggested stop through addPlaceToItinerary, which re-validates
 *   trip ownership, place membership, and day membership, and is idempotent.
 * - Applies additions in order, so sort orders remain stable and deterministic.
 */
export async function applyItineraryPlanToTrip(
  userId: string,
  input: { tripId: string; additions: PlanApplicationAddition[] }
): Promise<ItineraryItem[]> {
  if (!userId) throw new Error("Must be signed in");
  if (!input.tripId?.trim()) throw new Error("tripId is required");
  if (!Array.isArray(input.additions) || input.additions.length === 0) return [];

  await reconcileTripDays(userId, input.tripId);

  const applied: ItineraryItem[] = [];
  for (const addition of input.additions) {
    const item = await addPlaceToItinerary(userId, {
      tripId: input.tripId,
      tripDayId: addition.tripDayId,
      placeId: addition.placeId,
    });
    applied.push(item);
  }
  return applied;
}

/** Remove an item from a trip day. */
export async function removeItineraryItem(
  userId: string,
  input: RemoveItineraryItemInput
): Promise<void> {
  if (!userId) throw new Error("Must be signed in");
  if (!input.tripId?.trim()) throw new Error("tripId is required");
  if (!input.tripDayId?.trim()) throw new Error("tripDayId is required");
  if (!input.itemId?.trim()) throw new Error("itemId is required");

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data: tripDay } = await supabase
      .from("trip_days")
      .select("id")
      .eq("id", input.tripDayId)
      .eq("trip_id", input.tripId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (!tripDay) throw new Error("Trip day does not belong to this trip");

    const { error } = await supabase
      .from("itinerary_items")
      .delete()
      .eq("id", input.itemId)
      .eq("trip_day_id", input.tripDayId)
      .eq("trip_id", input.tripId)
      .eq("user_id", authenticatedUserId);

    if (error) throw new Error(error.message);
    return;
  }

  writeLocalItineraryItems(
    userId,
    readLocalItineraryItems(userId).filter((i) => !(
      i.id === input.itemId &&
      i.tripDayId === input.tripDayId &&
      i.tripId === input.tripId
    ))
  );
}

/**
 * Update an itinerary item's time slots and notes.
 * Only the provided fields are changed; the item must belong to the given
 * trip/day and to the authenticated user.
 */
export async function updateItineraryItem(
  userId: string,
  input: UpdateItineraryItemInput
): Promise<ItineraryItem> {
  if (!userId) throw new Error("Must be signed in");
  if (!input.tripId?.trim()) throw new Error("tripId is required");
  if (!input.tripDayId?.trim()) throw new Error("tripDayId is required");
  if (!input.itemId?.trim()) throw new Error("itemId is required");

  const timeError = validateItineraryTimeRange(input.startTime, input.endTime);
  if (timeError) throw new Error(timeError);

  let notes: string | null | undefined = input.notes;
  if (notes !== undefined && notes !== null) {
    if (notes.length > MAX_ITEM_NOTES_LENGTH) {
      throw new Error(`Notes must be ${MAX_ITEM_NOTES_LENGTH} characters or fewer`);
    }
    const trimmed = notes.trim();
    notes = trimmed === "" ? null : trimmed;
  }

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();

    // Verify the day belongs to this trip and user.
    const { data: tripDay } = await supabase
      .from("trip_days")
      .select("id")
      .eq("id", input.tripDayId)
      .eq("trip_id", input.tripId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();
    if (!tripDay) throw new Error("Trip day does not belong to this trip");

    // Verify the item belongs to this day/trip/user before touching it.
    const { data: existing } = await supabase
      .from("itinerary_items")
      .select("id")
      .eq("id", input.itemId)
      .eq("trip_day_id", input.tripDayId)
      .eq("trip_id", input.tripId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();
    if (!existing) throw new Error("Itinerary item not found");

    const patch: Record<string, unknown> = {};
    if (input.startTime !== undefined) patch.start_time = input.startTime;
    if (input.endTime !== undefined) patch.end_time = input.endTime;
    if (input.notes !== undefined) patch.notes = notes;

    const { data, error } = await supabase
      .from("itinerary_items")
      .update(patch)
      .eq("id", input.itemId)
      .eq("user_id", authenticatedUserId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapItineraryItemRow(data);
  }

  // Local fallback — the storage is already user-scoped, so matching the
  // item within this user's set enforces ownership.
  const tripDay = readLocalTripDays(userId).find(
    (d) => d.id === input.tripDayId && d.tripId === input.tripId
  );
  if (!tripDay) throw new Error("Trip day does not belong to this trip");

  const all = readLocalItineraryItems(userId);
  const index = all.findIndex(
    (i) =>
      i.id === input.itemId &&
      i.tripDayId === input.tripDayId &&
      i.tripId === input.tripId
  );
  if (index < 0) throw new Error("Itinerary item not found");

  const current = all[index];
  const updated: ItineraryItem = {
    ...current,
    startTime:
      input.startTime !== undefined ? input.startTime : current.startTime,
    endTime: input.endTime !== undefined ? input.endTime : current.endTime,
    notes:
      input.notes === undefined ? current.notes : (notes ?? null),
  };

  const next = all.slice();
  next[index] = updated;
  writeLocalItineraryItems(userId, next);
  return updated;
}

/**
 * Set the display order of a trip day's items. The provided ids must be
 * exactly the ids currently on that day (same set, any order).
 */
export async function reorderItineraryItems(
  userId: string,
  tripId: string,
  tripDayId: string,
  orderedItemIds: string[]
): Promise<ItineraryItem[]> {
  if (!userId) throw new Error("Must be signed in");
  if (!tripId) throw new Error("tripId is required");
  if (!tripDayId) throw new Error("tripDayId is required");

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();

    const { data: tripDay } = await supabase
      .from("trip_days")
      .select("id")
      .eq("id", tripDayId)
      .eq("trip_id", tripId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();
    if (!tripDay) throw new Error("Trip day does not belong to this trip");

    const { data: currentRows, error: currentError } = await supabase
      .from("itinerary_items")
      .select("id")
      .eq("trip_day_id", tripDayId)
      .eq("user_id", authenticatedUserId);
    if (currentError) throw new Error(currentError.message);

    const currentIds = (currentRows ?? []).map((r) => r.id).sort();
    if (!setsEqual(currentIds, [...orderedItemIds].sort())) {
      throw new Error("Item list does not match the items on this trip day");
    }

    const updates = orderedItemIds.map((itemId, index) =>
      supabase
        .from("itinerary_items")
        .update({ sort_order: index })
        .eq("id", itemId)
        .eq("trip_day_id", tripDayId)
        .eq("user_id", authenticatedUserId)
    );
    const results = await Promise.all(updates);
    for (const result of results) {
      if (result.error) throw new Error(result.error.message);
    }

    return getItineraryItems(userId, tripId);
  }

  const existing = readLocalItineraryItems(userId);
  const dayItems = existing.filter(
    (i) => i.tripId === tripId && i.tripDayId === tripDayId
  );
  const otherItems = existing.filter((i) => !(i.tripId === tripId && i.tripDayId === tripDayId));

  const dayIds = dayItems.map((i) => i.id).sort();
  if (!setsEqual(dayIds, [...orderedItemIds].sort())) {
    throw new Error("Item list does not match the items on this trip day");
  }

  const byId = new Map(dayItems.map((i) => [i.id, i]));
  const reordered = orderedItemIds.map((itemId, index) => ({
    ...byId.get(itemId)!,
    sortOrder: index,
  }));

  writeLocalItineraryItems(userId, [...otherItems, ...reordered]);
  return reordered.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Move an itinerary item to another day of the same trip.
 * The item's identity is preserved (trip_day_id + sort_order change only),
 * so times, notes, and place data carry across the move untouched.
 */
export async function moveItineraryItem(
  userId: string,
  input: MoveItineraryItemInput
): Promise<ItineraryItem> {
  if (!userId) throw new Error("Must be signed in");
  if (!input.tripId?.trim()) throw new Error("tripId is required");
  if (!input.itemId?.trim()) throw new Error("itemId is required");
  if (!input.toTripDayId?.trim()) throw new Error("toTripDayId is required");

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();

    // The source item must belong to the caller and to this trip.
    const { data: item, error: itemError } = await supabase
      .from("itinerary_items")
      .select("*")
      .eq("id", input.itemId)
      .eq("trip_id", input.tripId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!item) throw new Error("Itinerary item not found");

    if (item.trip_day_id === input.toTripDayId) {
      throw new Error("Item is already on this trip day");
    }

    // The target day must belong to the same trip and user.
    const { data: targetDay, error: targetError } = await supabase
      .from("trip_days")
      .select("day_number")
      .eq("id", input.toTripDayId)
      .eq("trip_id", input.tripId)
      .eq("user_id", authenticatedUserId)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!targetDay) throw new Error("Trip day does not belong to this trip");

    // Prevent the same place from appearing twice on the target day.
    const { data: duplicate } = await supabase
      .from("itinerary_items")
      .select("id")
      .eq("trip_day_id", input.toTripDayId)
      .eq("place_id", item.place_id)
      .maybeSingle();
    if (duplicate) {
      throw new Error(
        `${item.place_name} is already assigned to Day ${targetDay.day_number}`
      );
    }

    // Append to the target day's end — chronological display order is derived
    // from time-sorted rendering, not from sort_order alone.
    const { data: maxItem } = await supabase
      .from("itinerary_items")
      .select("sort_order")
      .eq("trip_day_id", input.toTripDayId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = (maxItem?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from("itinerary_items")
      .update({
        trip_day_id: input.toTripDayId,
        sort_order: nextSortOrder,
      })
      .eq("id", input.itemId)
      .eq("trip_id", input.tripId)
      .eq("user_id", authenticatedUserId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapItineraryItemRow(data);
  }

  // Local fallback — storage is user-scoped, so ownership is inherent.
  const existing = readLocalItineraryItems(userId);
  const index = existing.findIndex(
    (i) => i.id === input.itemId && i.tripId === input.tripId
  );
  if (index < 0) throw new Error("Itinerary item not found");
  const item = existing[index];

  if (item.tripDayId === input.toTripDayId) {
    throw new Error("Item is already on this trip day");
  }

  const targetDay = readLocalTripDays(userId).find(
    (d) => d.id === input.toTripDayId && d.tripId === input.tripId
  );
  if (!targetDay) throw new Error("Trip day does not belong to this trip");

  // Prevent the same place from appearing twice on the target day.
  if (
    existing.some(
      (i) =>
        i.id !== input.itemId &&
        i.tripDayId === input.toTripDayId &&
        i.placeId === item.placeId
    )
  ) {
    throw new Error(
      `${item.placeName} is already assigned to Day ${targetDay.dayNumber}`
    );
  }

  const targetItems = existing
    .filter((i) => i.tripDayId === input.toTripDayId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const nextSortOrder = targetItems.length;

  const updated: ItineraryItem = {
    ...item,
    tripDayId: input.toTripDayId,
    sortOrder: nextSortOrder,
  };

  const next = existing.slice();
  next[index] = updated;
  writeLocalItineraryItems(userId, next);
  return updated;
}

function setsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// ---------------------------------------------------------------------------
// DB → type mapping
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTripRow(row: Record<string, any>): Trip {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    destinationSlug: row.destination_slug,
    destinationName: row.destination_name,
    description: row.description ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    status: row.status as TripStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTripPlaceRow(row: Record<string, any>): TripPlace {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    placeId: row.place_id,
    destinationSlug: row.destination_slug,
    placeName: row.place_name,
    placeCategory: row.place_category,
    placeImageUrl: row.place_image_url ?? null,
    placeRating: row.place_rating != null ? Number(row.place_rating) : null,
    placePriceLevel: row.place_price_level ?? null,
    notes: row.notes ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTripDayRow(row: Record<string, any>): TripDay {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    dayNumber: row.day_number,
    date: row.date ?? null,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapItineraryItemRow(row: Record<string, any>): ItineraryItem {
  return {
    id: row.id,
    tripId: row.trip_id,
    tripDayId: row.trip_day_id,
    userId: row.user_id,
    placeId: row.place_id,
    placeName: row.place_name,
    placeCategory: row.place_category,
    placeImageUrl: row.place_image_url ?? null,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    notes: row.notes ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}