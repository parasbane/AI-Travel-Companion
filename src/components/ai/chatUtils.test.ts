import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAssistantChatRequestPayload,
  buildAssistantDecisionView,
  getAssistantResponseReferenceLabels,
} from "./chatUtils";
import type {
  AssistantDecisionSummary,
  AssistantResponseEnvelope,
  AssistantTurn,
} from "@/lib/ai/types";

describe("buildAssistantChatRequestPayload", () => {
  it("truncates recent turns and preserves preference context and selected places", () => {
    const recentTurns: AssistantTurn[] = Array.from({ length: 8 }).map((_, index) => ({
      id: `turn-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `  message ${index + 1}  `,
      createdAt: `2026-09-11T00:0${index}:00.000Z`,
      referencedPlaceIds: index === 7 ? ["goa-palolem"] : undefined,
    }));

    const payload = buildAssistantChatRequestPayload({
      destinationSlug: " goa ",
      message: "  Which place should we visit tomorrow morning?  ",
      recentTurns,
      selectedPlaceIds: ["goa-palolem", ""],
      preferenceContext: {
        profilePreferences: { budget: "balanced" },
        urlPreferences: { styles: ["relaxation"] },
      },
      requestId: "req-1",
      conversationId: "conv-1",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      currentPath: "/destinations/goa",
      maxRecentTurns: 6,
    });

    assert.equal(payload.destinationSlug, "goa");
    assert.equal(payload.message, "Which place should we visit tomorrow morning?");
    assert.equal(payload.recentTurns?.length, 6);
    assert.equal(payload.recentTurns?.[0].id, "turn-3");
    assert.deepEqual(payload.selectedPlaceIds, ["goa-palolem"]);
    assert.equal(payload.profilePreferences?.budget, "balanced");
    assert.deepEqual(payload.urlPreferences?.styles, ["relaxation"]);
    assert.equal(payload.conversationId, "conv-1");
  });

  it("includes trimmed userId and tripId when provided", () => {
    const payload = buildAssistantChatRequestPayload({
      destinationSlug: "goa",
      userId: "  user-a  ",
      tripId: "  trip_1  ",
      message: "What should we do on day one?",
      recentTurns: [],
    });

    assert.equal(payload.userId, "user-a");
    assert.equal(payload.tripId, "trip_1");
  });

  it("omits userId and tripId when empty or whitespace only", () => {
    const payload = buildAssistantChatRequestPayload({
      destinationSlug: "goa",
      userId: "",
      tripId: "   ",
      message: "hello",
      recentTurns: [],
    });

    assert.equal(payload.userId, undefined);
    assert.equal(payload.tripId, undefined);
  });
});

describe("getAssistantResponseReferenceLabels", () => {
  it("extracts reference labels from the grounded response", () => {
    const response: AssistantResponseEnvelope = {
      requestId: "req-1",
      destinationSlug: "goa",
      createdAt: "2026-09-11T12:00:00.000Z",
      intent: "recommend",
      answer: "Try Palolem Beach.",
      assistantTurn: {
        id: "assistant_req-1",
        role: "assistant",
        content: "Try Palolem Beach.",
        createdAt: "2026-09-11T12:00:00.000Z",
      },
      referencedPlaces: [
        {
          placeId: "goa-palolem",
          slug: "palolem-beach",
          name: "Palolem Beach",
          reason: "Top grounded option.",
        },
      ],
      highlightedPlaceIds: ["goa-palolem"],
      needsClarification: false,
      grounding: {
        candidatePlaceIds: ["goa-palolem"],
        selectedPlaceIds: ["goa-palolem"],
        referencedPlaceIds: ["goa-palolem"],
        rejectedPlaceIds: [],
        usedFallback: false,
      },
      preferenceUsage: {
        usedProfile: true,
        usedUrl: true,
        usedChat: false,
      },
    };

    assert.deepEqual(getAssistantResponseReferenceLabels(response), ["Palolem Beach"]);
  });
});

describe("buildAssistantDecisionView", () => {
  function makeEnvelope(
    overrides: Partial<AssistantResponseEnvelope> = {}
  ): AssistantResponseEnvelope {
    return {
      requestId: "req-1",
      destinationSlug: "goa",
      createdAt: "2026-09-11T12:00:00.000Z",
      intent: "decision",
      answer: "I'd pick Palolem Beach for a relaxing day.",
      assistantTurn: {
        id: "assistant_req-1",
        role: "assistant",
        content: "I'd pick Palolem Beach for a relaxing day.",
        createdAt: "2026-09-11T12:00:00.000Z",
        intent: "decision",
      },
      referencedPlaces: [
        {
          placeId: "goa-palolem",
          slug: "palolem-beach",
          name: "Palolem Beach",
          reason: "Top grounded option.",
        },
      ],
      primaryPlaceId: "goa-palolem",
      highlightedPlaceIds: ["goa-palolem"],
      needsClarification: false,
      grounding: {
        candidatePlaceIds: ["goa-palolem", "goa-dudhsagar"],
        selectedPlaceIds: ["goa-palolem"],
        referencedPlaceIds: ["goa-palolem"],
        rejectedPlaceIds: [],
        usedFallback: false,
      },
      preferenceUsage: {
        usedProfile: true,
        usedUrl: false,
        usedChat: false,
      },
      ...overrides,
    };
  }

  function makeDecisionSummary(
    overrides: Partial<AssistantDecisionSummary> = {}
  ): AssistantDecisionSummary {
    return {
      selectedPlaceId: "goa-palolem",
      selectedPlaceName: "Palolem Beach",
      rankedPlaces: [
        {
          placeId: "goa-palolem",
          placeName: "Palolem Beach",
          score: 88,
          factors: [
            { kind: "preference", label: "Strong relaxation match" },
            { kind: "group", label: "Good fit for your group" },
            { kind: "budget", label: "Fits your balanced budget" },
          ],
        },
        {
          placeId: "goa-dudhsagar",
          placeName: "Dudhsagar Falls",
          score: 61,
          factors: [{ kind: "preference", label: "Some relaxation match" }],
        },
      ],
      summary: "Ranked 2 grounded places, using your travel preferences.",
      signalsUsed: {
        preferences: true,
        weather: false,
        timing: false,
        trip: false,
        savedPlaces: false,
      },
      missingSignals: ["weather", "trip"],
      ...overrides,
    };
  }

  it("exposes the deterministic selected place and its factors in decision order", () => {
    const view = buildAssistantDecisionView(
      makeEnvelope({ decisionSummary: makeDecisionSummary() })
    );

    assert.equal(view?.selectedPlaceId, "goa-palolem");
    assert.equal(view?.selectedPlaceName, "Palolem Beach");
    assert.deepEqual(view?.reasons, [
      "Strong relaxation match",
      "Good fit for your group",
      "Fits your balanced budget",
    ]);
  });

  it("preserves the decision factors exactly and never invents or re-ranks them", () => {
    const summary = makeDecisionSummary();
    const view = buildAssistantDecisionView(makeEnvelope({ decisionSummary: summary }));

    assert.deepEqual(view?.summary, summary.summary);
    // Order comes from the decision layer, not from any other source.
    assert.deepEqual(
      view?.alternatives.map((place) => place.placeId),
      ["goa-dudhsagar"]
    );
    assert.deepEqual(
      view?.alternatives.map((place) => place.score),
      [61]
    );
    // The selected place must never appear as an alternative.
    assert.equal(
      view?.alternatives.some((place) => place.placeId === "goa-palolem"),
      false
    );
  });

  it("reports missing context honestly instead of guessing", () => {
    const view = buildAssistantDecisionView(
      makeEnvelope({ decisionSummary: makeDecisionSummary() })
    );

    assert.equal(
      view?.unavailableNote,
      "I don't have weather or your trip context, so I didn't guess."
    );
  });

  it("omits the unavailable note when no signals are missing", () => {
    const view = buildAssistantDecisionView(
      makeEnvelope({
        decisionSummary: makeDecisionSummary({
          missingSignals: [],
          signalsUsed: {
            preferences: true,
            weather: true,
            timing: true,
            trip: true,
            savedPlaces: false,
          },
        }),
      })
    );

    assert.equal(view?.unavailableNote, undefined);
  });

  it("returns null for non-decision responses so existing rendering is unchanged", () => {
    assert.equal(buildAssistantDecisionView(makeEnvelope({ intent: "recommend" })), null);
    assert.equal(buildAssistantDecisionView(makeEnvelope({ intent: "compare" })), null);
    assert.equal(buildAssistantDecisionView(makeEnvelope({ intent: "shortlist" })), null);
    assert.equal(buildAssistantDecisionView(makeEnvelope({ intent: "trip_focus" })), null);
    assert.equal(buildAssistantDecisionView(null), null);
    assert.equal(buildAssistantDecisionView(undefined), null);
  });

  it("handles an empty decision safely without throwing", () => {
    const view = buildAssistantDecisionView(
      makeEnvelope({
        referencedPlaces: [],
        primaryPlaceId: undefined,
        highlightedPlaceIds: [],
        decisionSummary: makeDecisionSummary({
          selectedPlaceId: undefined,
          selectedPlaceName: undefined,
          rankedPlaces: [],
          summary: "Ranked 0 grounded places.",
        }),
      })
    );

    assert.equal(view?.selectedPlaceId, undefined);
    assert.equal(view?.selectedPlaceName, undefined);
    assert.deepEqual(view?.reasons, []);
    assert.deepEqual(view?.alternatives, []);
  });

  it("handles a decision with factors but no selected place", () => {
    const view = buildAssistantDecisionView(
      makeEnvelope({
        decisionSummary: makeDecisionSummary({
          selectedPlaceId: undefined,
          selectedPlaceName: undefined,
          rankedPlaces: [
            {
              placeId: "goa-dudhsagar",
              placeName: "Dudhsagar Falls",
              score: 40,
              factors: [{ kind: "rating", label: "Solid 4.5 rating" }],
            },
          ],
        }),
      })
    );

    // No selection means no "why" list, and the ranked place stays an alternative.
    assert.deepEqual(view?.reasons, []);
    assert.deepEqual(
      view?.alternatives.map((place) => place.placeId),
      ["goa-dudhsagar"]
    );
  });

  it("falls back to the ranked place name when the selected name is absent", () => {
    const view = buildAssistantDecisionView(
      makeEnvelope({
        decisionSummary: makeDecisionSummary({ selectedPlaceName: undefined }),
      })
    );

    assert.equal(view?.selectedPlaceName, "Palolem Beach");
  });
});
