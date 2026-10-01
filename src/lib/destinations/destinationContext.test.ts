import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDestinationContext } from "./destinationContext";
import type {
  SpecificPlaceCategory,
  TravelGroupPreference,
} from "@/lib/places/types";

const CURATED_SLUGS = ["goa", "tokyo", "paris", "bali"];
const GENERIC_SLUGS: Array<string | { slug: string; name: string }> = [
  { slug: "kyoto", name: "Kyoto" },
  { slug: "rome", name: "Rome" },
  { slug: "new-york", name: "New York" },
];

const GROUP_IDS: TravelGroupPreference[] = [
  "solo",
  "couple",
  "friends",
  "family",
];

const VALID_CATEGORIES: SpecificPlaceCategory[] = [
  "culture",
  "food",
  "nature",
  "adventure",
  "relaxation",
  "nightlife",
  "attractions",
];

describe("getDestinationContext", () => {
  it("returns full curated context for all curated destinations", () => {
    for (const slug of CURATED_SLUGS) {
      const ctx = getDestinationContext(slug);
      assert.equal(ctx.hasCuratedContext, true, slug);
      assert.equal(ctx.slug, slug, slug);
      assert.ok(ctx.name.length > 0, slug);
      assert.ok(ctx.overview.length > 0, slug);
      assert.ok(ctx.goodFor.length >= 3, slug);
      for (const item of ctx.goodFor) {
        assert.ok(item.trim().length > 0, slug);
      }
      assert.deepEqual(new Set(ctx.goodFor).size, ctx.goodFor.length, slug);
      assert.ok(ctx.planningTips.length >= 3, slug);
      for (const tip of ctx.planningTips) {
        assert.ok(tip.trim().length > 0, slug);
      }
      assert.ok(ctx.availableCategories.length > 0, slug);
      for (const category of ctx.availableCategories) {
        assert.ok(
          VALID_CATEGORIES.includes(category),
          `${slug}:${category}`
        );
      }
      assert.deepEqual(
        [...Object.keys(ctx.travelerNotes)].sort(),
        [...GROUP_IDS].sort(),
        slug
      );
      for (const id of GROUP_IDS) {
        assert.ok(
          ctx.travelerNotes[id].trim().length > 0,
          `${slug}:${id}`
        );
      }
    }
  });

  it("returns a safe generic state for destinations without curated data", () => {
    const genericOverviews = new Set<string>();
    for (const entry of GENERIC_SLUGS) {
      const slug = typeof entry === "string" ? entry : entry.slug;
      const expectedName = typeof entry === "string" ? undefined : entry.name;
      const ctx = getDestinationContext(slug);
      assert.equal(ctx.hasCuratedContext, false, slug);
      assert.equal(ctx.slug, slug, slug);
      if (expectedName) {
        assert.equal(ctx.name, expectedName, slug);
      } else {
        assert.ok(ctx.name.length > 0, slug);
      }
      assert.ok(ctx.overview.length > 0, slug);
      assert.deepEqual(ctx.goodFor, [], slug);
      assert.deepEqual(ctx.planningTips, [], slug);
      assert.deepEqual(ctx.availableCategories, [], slug);
      for (const id of GROUP_IDS) {
        assert.ok(ctx.travelerNotes[id].trim().length > 0, `${slug}:${id}`);
      }
      genericOverviews.add(ctx.overview);
    }
    assert.equal(
      genericOverviews.size,
      1,
      "generic context must not fabricate destination-specific facts"
    );
  });

  it("normalizes slug input before lookup", () => {
    assert.deepEqual(getDestinationContext("  GOA "), getDestinationContext("goa"));
    assert.deepEqual(getDestinationContext("Goa, India"), getDestinationContext("goa"));
    assert.deepEqual(getDestinationContext("Tokyo"), getDestinationContext("tokyo"));
    assert.equal(getDestinationContext("New York").slug, "new-york");
    assert.equal(getDestinationContext("New York").name, "New York");
  });

  it("is deterministic and returns fresh copies", () => {
    const first = getDestinationContext("goa");
    const second = getDestinationContext("goa");
    assert.deepEqual(first, second);

    first.goodFor.push("tampered");
    first.travelerNotes.solo = "tampered";
    first.availableCategories = [];

    const third = getDestinationContext("goa");
    assert.deepEqual(third, second);
    assert.equal(third.goodFor.length, second.goodFor.length);
    assert.equal(third.travelerNotes.solo, second.travelerNotes.solo);
  });

  it("handles empty and malformed slugs without throwing", () => {
    for (const slug of ["", "   ", "!!!", "   "]) {
      const ctx = getDestinationContext(slug);
      assert.equal(ctx.hasCuratedContext, false);
      assert.deepEqual(ctx.goodFor, []);
      assert.deepEqual(ctx.planningTips, []);
    }
  });
});