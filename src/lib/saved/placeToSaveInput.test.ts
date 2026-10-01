import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSavePlaceInput } from "./placeToSaveInput";
import type { Place } from "@/lib/places/types";

const place: Place = {
  id: "goa-basilica-bom-jesus",
  slug: "basilica-of-bom-jesus",
  name: "Basilica of Bom Jesus",
  destination: "Goa",
  destinationSlug: "goa",
  category: "culture",
  description: "A UNESCO World Heritage site in Old Goa.",
  rating: 4.8,
  reviewCount: 14200,
  priceLevel: "free",
  address: "Old Goa Road, Bainguinim, Goa 403402",
  coordinates: { latitude: 15.5009, longitude: 73.9116 },
  imageUrl: "https://example.com/basilica.jpg",
  tags: ["UNESCO", "Heritage"],
  openingHours: "9:00 AM - 6:30 PM",
};

describe("buildSavePlaceInput", () => {
  test("maps every persisted Place field into a SavePlaceInput", () => {
    const input = buildSavePlaceInput(place);

    assert.equal(input.placeId, place.id);
    assert.equal(input.destinationSlug, place.destinationSlug);
    assert.equal(input.placeName, place.name);
    assert.equal(input.placeCategory, place.category);
    assert.equal(input.placeImageUrl, place.imageUrl);
    assert.equal(input.placeRating, place.rating);
    assert.equal(input.placePriceLevel, place.priceLevel);
    assert.equal(input.placeAddress, place.address);
  });

  test("produces a distinct identity per placeId", () => {
    const other = buildSavePlaceInput({ ...place, id: "goa-palolem-beach" });

    assert.notEqual(other.placeId, place.id);
    assert.equal(other.placeId, "goa-palolem-beach");
    assert.equal(other.destinationSlug, "goa");
  });
});