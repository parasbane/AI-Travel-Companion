import type {
  SavedPlace,
  SavePlaceInput,
  RemoveSavedPlaceInput,
} from "@/lib/saved/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// localStorage key helpers — always user-scoped, never shared between users
// ---------------------------------------------------------------------------

function localKey(userId: string): string {
  return `ai_travel_saved_places_${userId}`;
}

function readLocal(userId: string): SavedPlace[] {
  try {
    const raw = localStorage.getItem(localKey(userId));
    return raw ? (JSON.parse(raw) as SavedPlace[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(userId: string, items: SavedPlace[]): void {
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(items));
  } catch {
    // Storage may be unavailable — ignore silently
  }
}

async function getAuthenticatedUserId(userId: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || user.id !== userId) {
    throw new Error("Must be signed in to manage saved places");
  }

  return user.id;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function validateSavePlaceInput(input: SavePlaceInput): string | null {
  if (!input.placeId?.trim()) return "placeId is required";
  if (!input.destinationSlug?.trim()) return "destinationSlug is required";
  if (!input.placeName?.trim()) return "placeName is required";
  if (!input.placeCategory) return "placeCategory is required";
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get all saved places for the current user, newest first. */
export async function getSavedPlaces(userId: string): Promise<SavedPlace[]> {
  if (!userId) return [];

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_places")
      .select("*")
      .eq("user_id", authenticatedUserId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  // Local dev fallback
  return readLocal(userId);
}

/** Backwards-compatible name for callers using the original service API. */
export const listSavedPlaces = getSavedPlaces;

/** Return whether a place is saved for the current user. */
export async function isPlaceSaved(
  userId: string,
  placeId: string
): Promise<boolean> {
  if (!userId || !placeId.trim()) return false;

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_places")
      .select("id")
      .eq("user_id", authenticatedUserId)
      .eq("place_id", placeId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  return readLocal(userId).some((savedPlace) => savedPlace.placeId === placeId);
}

/** Save a place for the current user. Silently ignores duplicates. */
export async function savePlace(
  userId: string,
  input: SavePlaceInput
): Promise<SavedPlace> {
  if (!userId) throw new Error("Must be signed in to save a place");

  const err = validateSavePlaceInput(input);
  if (err) throw new Error(err);

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_places")
      .upsert(
        {
          user_id: authenticatedUserId,
          place_id: input.placeId,
          destination_slug: input.destinationSlug,
          place_name: input.placeName,
          place_category: input.placeCategory,
          place_image_url: input.placeImageUrl ?? null,
          place_rating: input.placeRating ?? null,
          place_price_level: input.placePriceLevel ?? null,
          place_address: input.placeAddress ?? null,
        },
        { onConflict: "user_id,place_id", ignoreDuplicates: false }
      )
      .select()
      .single();

    if (error) throw new Error(error.message);
    return mapRow(data);
  }

  // Local dev fallback
  const existing = readLocal(userId);
  const duplicate = existing.find((s) => s.placeId === input.placeId);
  if (duplicate) return duplicate;

  const newItem: SavedPlace = {
    id: `local_${Date.now()}`,
    userId,
    placeId: input.placeId,
    destinationSlug: input.destinationSlug,
    placeName: input.placeName,
    placeCategory: input.placeCategory,
    placeImageUrl: input.placeImageUrl ?? null,
    placeRating: input.placeRating ?? null,
    placePriceLevel: input.placePriceLevel ?? null,
    placeAddress: input.placeAddress ?? null,
    createdAt: new Date().toISOString(),
  };

  writeLocal(userId, [newItem, ...existing]);
  return newItem;
}

/** Remove a saved place by placeId for the current user. */
export async function removeSavedPlace(
  userId: string,
  placeId: RemoveSavedPlaceInput["placeId"]
): Promise<void> {
  if (!userId) throw new Error("Must be signed in");
  if (!placeId?.trim()) throw new Error("placeId is required");

  if (isSupabaseConfigured()) {
    const authenticatedUserId = await getAuthenticatedUserId(userId);
    const supabase = createClient();
    const { error } = await supabase
      .from("saved_places")
      .delete()
      .eq("user_id", authenticatedUserId)
      .eq("place_id", placeId);
    // RLS ensures only own rows are deleted

    if (error) throw new Error(error.message);
    return;
  }

  // Local dev fallback
  const existing = readLocal(userId);
  writeLocal(
    userId,
    existing.filter((s) => s.placeId !== placeId)
  );
}

// ---------------------------------------------------------------------------
// DB → type mapping
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>): SavedPlace {
  return {
    id: row.id,
    userId: row.user_id,
    placeId: row.place_id,
    destinationSlug: row.destination_slug,
    placeName: row.place_name,
    placeCategory: row.place_category,
    placeImageUrl: row.place_image_url ?? null,
    placeRating: row.place_rating != null ? Number(row.place_rating) : null,
    placePriceLevel: row.place_price_level ?? null,
    placeAddress: row.place_address ?? null,
    createdAt: row.created_at,
  };
}
