import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  initialSavedPlacesState,
  savedPlacesReducer,
  type SavedPlacesState,
} from "./SavedPlacesContext";
import type { SavedPlace } from "@/lib/saved/types";

const savedPlace: SavedPlace = {
  id: "saved-1",
  userId: "user-a",
  placeId: "goa-palolem-beach",
  destinationSlug: "goa",
  placeName: "Palolem Beach",
  placeCategory: "relaxation",
  placeImageUrl: null,
  placeRating: null,
  placePriceLevel: null,
  placeAddress: null,
  createdAt: "2026-09-17T00:00:00.000Z",
};

describe("SavedPlacesContext state behavior", () => {
  test("models loading and refresh completion", () => {
    const loading = savedPlacesReducer(initialSavedPlacesState, { type: "loading" });
    const loaded = savedPlacesReducer(loading, {
      type: "loaded",
      savedPlaces: [savedPlace],
    });

    assert.equal(loading.isLoading, true);
    assert.equal(loaded.isLoading, false);
    assert.deepEqual(loaded.savedPlaces, [savedPlace]);
  });

  test("supports optimistic save, toggle removal, and error recovery", () => {
    const optimistic = { ...savedPlace, id: "optimistic_goa-palolem-beach" };
    const saved = savedPlacesReducer(initialSavedPlacesState, {
      type: "add",
      savedPlace: optimistic,
    });
    const confirmed = savedPlacesReducer(saved, {
      type: "replace",
      temporaryId: optimistic.id,
      savedPlace,
    });
    const toggledOff = savedPlacesReducer(confirmed, {
      type: "remove",
      placeId: savedPlace.placeId,
    });
    const recovered = savedPlacesReducer(toggledOff, {
      type: "add",
      savedPlace,
    });
    const failed: SavedPlacesState = savedPlacesReducer(recovered, {
      type: "error",
      error: "Network unavailable",
    });

    assert.equal(confirmed.savedPlaces[0].id, "saved-1");
    assert.equal(toggledOff.savedPlaces.length, 0);
    assert.equal(recovered.savedPlaces.length, 1);
    assert.equal(failed.error, "Network unavailable");
    assert.equal(failed.isLoading, false);
  });

  test("resets to an unauthenticated state", () => {
    const state = savedPlacesReducer(initialSavedPlacesState, {
      type: "loaded",
      savedPlaces: [savedPlace],
    });
    const reset = savedPlacesReducer(state, { type: "reset" });

    assert.deepEqual(reset.savedPlaces, []);
    assert.equal(reset.isLoading, false);
    assert.equal(reset.error, null);
  });
});
