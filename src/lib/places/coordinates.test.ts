import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Place } from "./types";
import {
  DEFAULT_MAP_ZOOM,
  getBoundsFromPlaces,
  getFallbackMapCenter,
  getMappablePlaces,
  hasValidCoordinates,
} from "./coordinates";

function makePlace(
  id: string,
  coords: { latitude: number; longitude: number } | null,
  category: Place["category"] = "culture"
): Place {
  return {
    id,
    slug: id,
    name: id,
    destination: "Test",
    destinationSlug: "test",
    category,
    description: "Test place",
    rating: 4,
    reviewCount: 10,
    priceLevel: "moderate",
    address: "Somewhere",
    coordinates: coords ?? { latitude: Number.NaN, longitude: Number.NaN },
    imageUrl: "https://example.com/img.jpg",
    tags: [],
  };
}

describe("hasValidCoordinates", () => {
  it("accepts finite in-range coordinates", () => {
    assert.equal(
      hasValidCoordinates({ latitude: 15.3, longitude: 74.1 }),
      true
    );
  });

  it("rejects null, undefined, NaN, and out-of-range values", () => {
    assert.equal(hasValidCoordinates(null), false);
    assert.equal(hasValidCoordinates(undefined), false);
    assert.equal(
      hasValidCoordinates({ latitude: Number.NaN, longitude: 10 }),
      false
    );
    assert.equal(
      hasValidCoordinates({ latitude: 91, longitude: 10 }),
      false
    );
    assert.equal(
      hasValidCoordinates({ latitude: 10, longitude: 181 }),
      false
    );
  });

  it("accepts (0, 0) as geographically valid", () => {
    assert.equal(hasValidCoordinates({ latitude: 0, longitude: 0 }), true);
  });
});

describe("getMappablePlaces", () => {
  it("keeps only places with valid coordinates", () => {
    const places = [
      makePlace("a", { latitude: 15, longitude: 74 }),
      makePlace("b", { latitude: 200, longitude: 74 }),
      makePlace("c", { latitude: 35, longitude: 139 }),
    ];
    const mappable = getMappablePlaces(places);
    assert.deepEqual(
      mappable.map((p) => p.id),
      ["a", "c"]
    );
  });

  it("does not change membership when places are only reordered", () => {
    const places = [
      makePlace("z", { latitude: 1, longitude: 2 }),
      makePlace("a", { latitude: 3, longitude: 4 }),
    ];
    const sorted = [...places].sort((x, y) => x.id.localeCompare(y.id));
    assert.equal(getMappablePlaces(places).length, getMappablePlaces(sorted).length);
    assert.deepEqual(
      new Set(getMappablePlaces(places).map((p) => p.id)),
      new Set(getMappablePlaces(sorted).map((p) => p.id))
    );
  });
});

describe("getBoundsFromPlaces", () => {
  it("returns null for empty or invalid sets", () => {
    assert.equal(getBoundsFromPlaces([]), null);
    assert.equal(
      getBoundsFromPlaces([makePlace("bad", { latitude: 99, longitude: 0 })]),
      null
    );
  });

  it("returns matching corners for a single place", () => {
    const bounds = getBoundsFromPlaces([
      makePlace("solo", { latitude: 48.85, longitude: 2.35 }),
    ]);
    assert.deepEqual(bounds, {
      southWest: { latitude: 48.85, longitude: 2.35 },
      northEast: { latitude: 48.85, longitude: 2.35 },
    });
  });

  it("computes min/max bounds across places", () => {
    const bounds = getBoundsFromPlaces([
      makePlace("a", { latitude: 10, longitude: 20 }),
      makePlace("b", { latitude: 12, longitude: 18 }),
      makePlace("c", { latitude: 11, longitude: 22 }),
    ]);
    assert.deepEqual(bounds, {
      southWest: { latitude: 10, longitude: 18 },
      northEast: { latitude: 12, longitude: 22 },
    });
  });
});

describe("getFallbackMapCenter", () => {
  it("averages mappable place coordinates", () => {
    const center = getFallbackMapCenter([
      makePlace("a", { latitude: 10, longitude: 20 }),
      makePlace("b", { latitude: 20, longitude: 40 }),
    ]);
    assert.deepEqual(center, { latitude: 15, longitude: 30 });
  });

  it("uses destination center when no mappable places exist", () => {
    const center = getFallbackMapCenter(
      [makePlace("bad", { latitude: Number.NaN, longitude: Number.NaN })],
      { latitude: 35.67, longitude: 139.65 }
    );
    assert.deepEqual(center, { latitude: 35.67, longitude: 139.65 });
  });

  it("returns null when nothing usable exists", () => {
    assert.equal(getFallbackMapCenter([]), null);
    assert.equal(
      getFallbackMapCenter([], { latitude: 100, longitude: 0 }),
      null
    );
  });

  it("exposes a default zoom constant for single-point views", () => {
    assert.equal(DEFAULT_MAP_ZOOM, 12);
  });
});

describe("filtered places reaching the map", () => {
  it("preserves all valid places after reorder (sort does not drop markers)", () => {
    const places = [
      makePlace("b", { latitude: 10, longitude: 20 }, "food"),
      makePlace("a", { latitude: 11, longitude: 21 }, "nature"),
      makePlace("bad", { latitude: 999, longitude: 0 }, "culture"),
    ];
    const reordered = [...places].sort((x, y) => x.id.localeCompare(y.id));
    assert.deepEqual(
      getMappablePlaces(reordered).map((p) => p.id).sort(),
      ["a", "b"]
    );
  });

  it("reflects category-style filtering before mapping", () => {
    const places = [
      makePlace("food-1", { latitude: 10, longitude: 20 }, "food"),
      makePlace("nature-1", { latitude: 11, longitude: 21 }, "nature"),
    ];
    const filtered = places.filter((p) => p.category === "food");
    assert.deepEqual(
      getMappablePlaces(filtered).map((p) => p.id),
      ["food-1"]
    );
  });
});
