import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Place } from "@/lib/places/types";
import {
  groundCandidatePlaces,
  validateGroundedPlaceReferences,
  MAX_GROUNDED_CANDIDATES,
} from "./grounding";

function makePlace(id: string, matchScore: number): Place {
  return {
    id,
    slug: id,
    name: id,
    destination: "Test",
    destinationSlug: "test",
    category: "culture",
    description: "Test place",
    rating: 4.5,
    reviewCount: 100,
    priceLevel: "budget",
    address: "Somewhere",
    coordinates: { latitude: 10, longitude: 20 },
    imageUrl: "https://example.com/img.jpg",
    tags: ["Tag"],
    matchScore,
  };
}

describe("groundCandidatePlaces", () => {
  it("keeps candidate extraction bounded and preserves matchScore", () => {
    const places = Array.from({ length: MAX_GROUNDED_CANDIDATES + 2 }).map((_, index) =>
      makePlace(`place-${index + 1}`, 90 - index)
    );

    const result = groundCandidatePlaces({
      places,
      selectedPlaceIds: ["place-1", "missing-place"],
    });

    assert.equal(result.candidatePlaces.length, MAX_GROUNDED_CANDIDATES);
    assert.equal(result.candidatePlaces[0].matchScore, 90);
    assert.deepEqual(result.selectedPlaceIds, ["place-1"]);
    assert.deepEqual(result.rejectedPlaceIds, ["missing-place"]);
    assert.equal(result.candidatePlaces[0].source, "place-provider");
  });
});

describe("validateGroundedPlaceReferences", () => {
  it("rejects unknown place references", () => {
    const validation = validateGroundedPlaceReferences(
      ["place-1", "place-2"],
      ["place-1", "unknown", "place-2"]
    );

    assert.equal(validation.isValid, false);
    assert.deepEqual(validation.validPlaceIds, ["place-1", "place-2"]);
    assert.deepEqual(validation.rejectedPlaceIds, ["unknown"]);
  });
});
