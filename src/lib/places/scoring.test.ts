import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Place } from "./types";
import {
  hasPersonalizationPrefs,
  parseStylesQueryParam,
  rankPlaces,
  resolveRecommendationPreferences,
  scorePlace,
} from "./scoring";
import { PlaceProvider } from "./provider";
import {
  applyRanking,
  createRankingStrategy,
  DeterministicRankingStrategy,
} from "./rankingStrategy";

function makePlace(overrides: Partial<Place> & Pick<Place, "id" | "category" | "priceLevel">): Place {
  return {
    slug: overrides.id,
    name: overrides.name ?? overrides.id,
    destination: "Test",
    destinationSlug: "test",
    description: "Test place",
    rating: overrides.rating ?? 4,
    reviewCount: overrides.reviewCount ?? 100,
    address: "Somewhere",
    coordinates: { latitude: 0, longitude: 0 },
    imageUrl: "https://example.com/img.jpg",
    tags: overrides.tags ?? [],
    ...overrides,
  };
}

const foodBudget = makePlace({
  id: "food-budget",
  category: "food",
  priceLevel: "budget",
  rating: 4.2,
  tags: ["Street Food", "Local Flavors"],
});

const nightlifeExpensive = makePlace({
  id: "nightlife-expensive",
  category: "nightlife",
  priceLevel: "expensive",
  rating: 4.8,
  tags: ["Cocktails", "Club"],
});

const natureFree = makePlace({
  id: "nature-free",
  category: "nature",
  priceLevel: "free",
  rating: 4.5,
  tags: ["Park", "Picnic", "Family"],
});

const cultureModerate = makePlace({
  id: "culture-moderate",
  category: "culture",
  priceLevel: "moderate",
  rating: 4.0,
  tags: ["Heritage", "History"],
});

describe("hasPersonalizationPrefs", () => {
  it("returns false for empty prefs", () => {
    assert.equal(hasPersonalizationPrefs(undefined), false);
    assert.equal(hasPersonalizationPrefs({}), false);
    assert.equal(hasPersonalizationPrefs({ styles: [] }), false);
  });

  it("returns true when any signal is present", () => {
    assert.equal(hasPersonalizationPrefs({ styles: ["food"] }), true);
    assert.equal(hasPersonalizationPrefs({ budget: "luxury" }), true);
    assert.equal(hasPersonalizationPrefs({ group: "family" }), true);
  });
});

describe("parseStylesQueryParam / resolveRecommendationPreferences", () => {
  it("parses comma-separated styles and ignores unknowns", () => {
    assert.deepEqual(parseStylesQueryParam("food,culture,unknown"), [
      "food",
      "culture",
    ]);
  });

  it("accepts attractions and landmarks alias for Landmarks interest", () => {
    assert.deepEqual(parseStylesQueryParam("attractions,landmarks,food"), [
      "attractions",
      "food",
    ]);
  });

  it("lets URL styles win over profile styles", () => {
    const prefs = resolveRecommendationPreferences({
      urlStyles: ["nature"],
      profileStyles: ["food", "nightlife"],
      budget: "balanced",
      group: "couple",
    });
    assert.deepEqual(prefs.styles, ["nature"]);
    assert.equal(prefs.budget, "balanced");
    assert.equal(prefs.group, "couple");
  });

  it("falls back to profile styles when URL is empty", () => {
    const prefs = resolveRecommendationPreferences({
      urlStyles: [],
      profileStyles: ["adventure"],
      budget: "budget",
    });
    assert.deepEqual(prefs.styles, ["adventure"]);
  });

  it("lets URL budget and group override profile fields", () => {
    const prefs = resolveRecommendationPreferences({
      urlStyles: ["food"],
      urlBudget: "luxury",
      urlGroup: "friends",
      profileStyles: ["culture"],
      budget: "budget",
      group: "solo",
    });
    assert.deepEqual(prefs.styles, ["food"]);
    assert.equal(prefs.budget, "luxury");
    assert.equal(prefs.group, "friends");
  });

  it("falls back to profile budget/group when URL omits them", () => {
    const prefs = resolveRecommendationPreferences({
      urlStyles: ["nature"],
      profileStyles: ["food"],
      budget: "balanced",
      group: "family",
    });
    assert.deepEqual(prefs.styles, ["nature"]);
    assert.equal(prefs.budget, "balanced");
    assert.equal(prefs.group, "family");
  });
});

describe("scorePlace", () => {
  it("scores attractions higher when Landmarks interest is selected", () => {
    const landmark = makePlace({
      id: "landmark",
      category: "attractions",
      priceLevel: "moderate",
      rating: 4.1,
      tags: ["Viewpoint"],
    });
    const prefs = { styles: ["attractions"] };
    const landmarkScore = scorePlace(landmark, prefs)!;
    const foodScore = scorePlace(foodBudget, prefs)!;
    assert.ok(landmarkScore > foodScore);
  });

  it("returns undefined without prefs", () => {
    assert.equal(scorePlace(foodBudget, {}), undefined);
  });

  it("scores style category match higher than mismatch", () => {
    const prefs = { styles: ["food"] };
    const foodScore = scorePlace(foodBudget, prefs)!;
    const natureScore = scorePlace(natureFree, prefs)!;
    assert.ok(foodScore > natureScore);
    assert.ok(foodScore >= 0 && foodScore <= 100);
  });

  it("prefers budget-friendly price levels for budget users", () => {
    const prefs = { budget: "budget" as const };
    const cheap = scorePlace(natureFree, prefs)!;
    const pricey = scorePlace(nightlifeExpensive, prefs)!;
    assert.ok(cheap > pricey);
  });

  it("boosts family-friendly places for family group", () => {
    const prefs = { group: "family" as const };
    const familyPlace = scorePlace(natureFree, prefs)!;
    const nightlife = scorePlace(nightlifeExpensive, prefs)!;
    assert.ok(familyPlace > nightlife);
  });

  it("is deterministic for identical inputs", () => {
    const prefs = {
      styles: ["culture", "food"],
      budget: "balanced" as const,
      group: "couple" as const,
    };
    assert.equal(scorePlace(cultureModerate, prefs), scorePlace(cultureModerate, prefs));
  });
});

describe("rankPlaces", () => {
  const places = [nightlifeExpensive, foodBudget, natureFree, cultureModerate];

  it("leaves order unchanged without prefs", () => {
    const ranked = rankPlaces(places, {});
    assert.deepEqual(
      ranked.map((p) => p.id),
      places.map((p) => p.id)
    );
    assert.equal(ranked[0].matchScore, undefined);
  });

  it("orders by matchScore descending for food styles", () => {
    const ranked = rankPlaces(places, { styles: ["food"] });
    assert.equal(ranked[0].id, "food-budget");
    assert.ok((ranked[0].matchScore ?? 0) >= (ranked[1].matchScore ?? 0));
  });

  it("preserves original index on equal scores", () => {
    const a = makePlace({
      id: "a",
      category: "attractions",
      priceLevel: "moderate",
      rating: 4,
      tags: [],
    });
    const b = makePlace({
      id: "b",
      category: "attractions",
      priceLevel: "moderate",
      rating: 4,
      tags: [],
    });
    const ranked = rankPlaces([a, b], { styles: ["food"] });
    assert.deepEqual(
      ranked.map((p) => p.id),
      ["a", "b"]
    );
  });

  it("does not drop places (no hard filter)", () => {
    const ranked = rankPlaces(places, {
      styles: ["food"],
      budget: "luxury",
      group: "solo",
    });
    assert.equal(ranked.length, places.length);
  });
});

describe("RankingStrategy", () => {
  it("exposes a deterministic strategy via factory", () => {
    const strategy = createRankingStrategy("deterministic");
    assert.ok(strategy instanceof DeterministicRankingStrategy);
    const ranked = applyRanking([foodBudget, natureFree], { styles: ["nature"] });
    assert.equal(ranked[0].id, "nature-free");
  });
});

describe("PlaceProvider personalization", () => {
  it("reorders curated places for Recommended + prefs", async () => {
    const editorial = await PlaceProvider.getDestinationPlaces("tokyo", {
      sort: "recommended",
    });
    const personalized = await PlaceProvider.getDestinationPlaces("tokyo", {
      sort: "recommended",
      preferences: { styles: ["food"] },
    });

    assert.ok(personalized.places.length > 0);
    assert.equal(personalized.places.length, editorial.places.length);
    assert.equal(personalized.places[0].category, "food");
    assert.ok(typeof personalized.places[0].matchScore === "number");
  });

  it("ignores prefs order when sorting by rating", async () => {
    const byRating = await PlaceProvider.getDestinationPlaces("tokyo", {
      sort: "rating",
      preferences: { styles: ["food"] },
    });
    for (let i = 1; i < byRating.places.length; i++) {
      assert.ok(byRating.places[i - 1].rating >= byRating.places[i].rating);
    }
  });
});
