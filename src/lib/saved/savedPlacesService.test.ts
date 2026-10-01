import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  getSavedPlaces,
  isPlaceSaved,
  removeSavedPlace,
  savePlace,
} from "./savedPlacesService";
import type { SavePlaceInput } from "./types";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}

const place: SavePlaceInput = {
  placeId: "goa-palolem-beach",
  destinationSlug: "goa",
  placeName: "Palolem Beach",
  placeCategory: "relaxation",
};

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const storage = new MemoryStorage();

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  Object.assign(globalThis, { localStorage: storage });
  storage.clear();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});

describe("savedPlacesService local fallback", () => {
  test("saves, reads, checks, and removes a place", async () => {
    const saved = await savePlace("user-a", place);

    assert.equal(saved.userId, "user-a");
    assert.equal(await isPlaceSaved("user-a", place.placeId), true);
    assert.equal((await getSavedPlaces("user-a")).length, 1);

    await removeSavedPlace("user-a", place.placeId);

    assert.equal(await isPlaceSaved("user-a", place.placeId), false);
    assert.deepEqual(await getSavedPlaces("user-a"), []);
  });

  test("keeps the fallback scoped to the authenticated user", async () => {
    await savePlace("user-a", place);

    assert.equal((await getSavedPlaces("user-b")).length, 0);
    assert.equal(await isPlaceSaved("user-b", place.placeId), false);
  });

  test("does not persist for an unauthenticated caller", async () => {
    await assert.rejects(() => savePlace("", place), /Must be signed in/);
    await assert.rejects(
      () => removeSavedPlace("", place.placeId),
      /Must be signed in/
    );
  });
});
