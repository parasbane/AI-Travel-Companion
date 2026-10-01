import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPersonalizationToSearchParams,
  decodePersonalizationQuery,
  encodePersonalizationQuery,
  hasSessionPersonalizationPrefs,
  parseBudgetPreferenceParam,
  parseGroupPreferenceParam,
  parsePersonalizationSearchParams,
  parseTripPreferenceParam,
  sessionToRecommendationPreferences,
} from "./preferenceParams";
import { hasPersonalizationPrefs } from "./scoring";

describe("preferenceParams parsing", () => {
  it("parses valid budget, group, and trip params", () => {
    assert.equal(parseBudgetPreferenceParam("balanced"), "balanced");
    assert.equal(parseGroupPreferenceParam("couple"), "couple");
    assert.equal(parseTripPreferenceParam("weekend"), "weekend");
  });

  it("drops invalid preference values", () => {
    assert.equal(parseBudgetPreferenceParam("premium"), undefined);
    assert.equal(parseGroupPreferenceParam("party"), undefined);
    assert.equal(parseTripPreferenceParam("asap"), undefined);
  });

  it("parses a full personalization search object", () => {
    const session = parsePersonalizationSearchParams({
      styles: "food,attractions,bogus",
      group: "friends",
      budgetPreference: "luxury",
      trip: "longer",
      category: "culture",
    });
    assert.deepEqual(session.styles, ["food", "attractions"]);
    assert.equal(session.group, "friends");
    assert.equal(session.budget, "luxury");
    assert.equal(session.trip, "longer");
  });
});

describe("preferenceParams encode/decode", () => {
  it("round-trips scoring prefs and optional trip", () => {
    const query = encodePersonalizationQuery(
      {
        styles: ["nature", "attractions"],
        budget: "budget",
        group: "family",
      },
      "weekend"
    );
    const decoded = decodePersonalizationQuery(query);
    assert.deepEqual(decoded.styles, ["nature", "attractions"]);
    assert.equal(decoded.budget, "budget");
    assert.equal(decoded.group, "family");
    assert.equal(decoded.trip, "weekend");
  });

  it("clears personalization keys while preserving unrelated params", () => {
    const params = new URLSearchParams(
      "category=food&styles=food&group=solo&budgetPreference=balanced&trip=flexible&budget=moderate"
    );
    applyPersonalizationToSearchParams(params, { styles: [] });
    assert.equal(params.get("category"), "food");
    assert.equal(params.get("budget"), "moderate");
    assert.equal(params.get("styles"), null);
    assert.equal(params.get("group"), null);
    assert.equal(params.get("budgetPreference"), null);
    assert.equal(params.get("trip"), null);
  });

  it("maps session to RecommendationPreferences without trip", () => {
    const prefs = sessionToRecommendationPreferences({
      styles: ["culture"],
      budget: "balanced",
      group: "couple",
      trip: "flexible",
    });
    assert.deepEqual(prefs, {
      styles: ["culture"],
      budget: "balanced",
      group: "couple",
    });
    assert.ok(!("trip" in prefs));
  });
});

describe("personalization active / reset behavior", () => {
  it("treats empty session as inactive", () => {
    assert.equal(hasSessionPersonalizationPrefs({ styles: [] }), false);
    assert.equal(
      hasPersonalizationPrefs(sessionToRecommendationPreferences({ styles: [] })),
      false
    );
  });

  it("treats styles, budget, or group as active session prefs", () => {
    assert.equal(
      hasSessionPersonalizationPrefs({ styles: ["food"] }),
      true
    );
    assert.equal(
      hasSessionPersonalizationPrefs({ styles: [], budget: "luxury" }),
      true
    );
    assert.equal(
      hasSessionPersonalizationPrefs({ styles: [], group: "solo" }),
      true
    );
  });

  it("does not treat trip-only session as scoring personalization", () => {
    assert.equal(
      hasSessionPersonalizationPrefs({ styles: [], trip: "weekend" }),
      false
    );
  });
});
