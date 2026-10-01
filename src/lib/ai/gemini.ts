import { GoogleGenAI, Type } from "@google/genai";
import { validateGroundedPlaceReferences } from "./grounding";
import { isWeatherRelevantQuestion } from "./weatherContext";
import type { TravelDecisionResult } from "./travelDecision";
import type {
  AssistantCandidatePlace,
  AssistantResponseEnvelope,
  AssistantResponseReferencePlace,
  AssistantTurn,
  TravelContext,
} from "./types";

const MAX_TRIP_ISSUES_IN_PROMPT = 20;

/** Feature 20: how many deterministic ranked places are explained to the model. */
const MAX_DECISION_PLACES_IN_PROMPT = 3;

export interface GeminiTravelPayload {
  answer: string;
  referencedPlaceIds: string[];
  placeReasons?: Array<{ placeId: string; reason: string }>;
  needsClarification: boolean;
  clarificationQuestion?: string;
}

export type GeminiClientLike = {
  models: {
    generateContent: (params: {
      model: string;
      contents: string;
      config?: {
        systemInstruction?: string;
        responseMimeType?: string;
        responseSchema?: unknown;
        temperature?: number;
      };
    }) => Promise<{ text?: string | null }>;
  };
};

let mockGeminiClient: GeminiClientLike | null = null;

/**
 * Allows test suites to supply a mock client so real API calls are never made in tests.
 */
export function setGeminiClientForTesting(client: GeminiClientLike | null): void {
  mockGeminiClient = client;
}

/** Production backoff: 2 retries, ~800ms then ~1600ms. */
const RETRY_DELAYS_MS = [800, 1600] as const;

let retryDelaysMs: number[] = [...RETRY_DELAYS_MS];

/**
 * Overrides the retry backoff delays so tests do not wait on real timers.
 * Pass `null` to restore the production values.
 */
export function setGeminiRetryDelaysForTesting(delays: number[] | null): void {
  retryDelaysMs = delays === null ? [...RETRY_DELAYS_MS] : [...delays];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detects a temporary Gemini overload/availability failure. Deliberately
 * narrow: only an explicit 503 or an UNAVAILABLE status/code is retried, so
 * 400/401/403/404, validation, grounding and application errors fail fast
 * exactly as they did before.
 */
export function isRetryableGeminiError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const errorRecord = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };

  for (const value of [errorRecord.status, errorRecord.code]) {
    if (value === 503 || value === "503") return true;
    if (typeof value === "string" && value.toUpperCase() === "UNAVAILABLE") return true;
  }

  // Some SDK errors only surface a message. Require an explicit 503 alongside a
  // transient-capacity phrase so unrelated errors are never retried.
  if (typeof errorRecord.message === "string") {
    const message = errorRecord.message;
    return /\b503\b/.test(message) &&
      /unavailable|overloaded|high[-\s]?demand|try again|temporarily/i.test(message);
  }

  return false;
}

export function getGeminiClient(apiKey: string): GeminiClientLike {
  if (mockGeminiClient) {
    return mockGeminiClient;
  }
  return new GoogleGenAI({ apiKey }) as unknown as GeminiClientLike;
}

export function buildGeminiSystemInstruction(): string {
  return [
    "You are an expert, friendly, and reliable AI Travel Companion.",
    "Your goal is to provide personalized, helpful travel recommendations and answers to the traveller.",
    "",
    "CRITICAL GROUNDING AND ACCURACY RULES:",
    "1. You MUST only make factual claims about places using the supplied candidate places in the context.",
    "2. NEVER invent places, ratings, prices, addresses, opening hours, distances, reviews, or other unsupported facts.",
    "3. Only reference placeIds that explicitly exist in the provided candidate places list.",
    "4. If the supplied context is insufficient to answer the traveller's request, set needsClarification to true and ask a useful, polite clarification question instead of guessing or hallucinating.",
    "5. Preserve and explain the matchScore when discussing recommended places (e.g. 'with a 92/100 match for your preferences').",
    "6. Answer naturally and conversationally, but remain strictly factual and grounded.",
    "7. You may reason about the supplied weather/forecast context when it is relevant to the traveller's question (e.g. a rainy forecast can support indoor, cultural, or dining options; a clear forecast can support outdoor, nature, or beach options; high heat can support shade, indoor, or early-day options).",
    "8. NEVER invent weather conditions, temperatures, precipitation probabilities, or other weather facts. Only use values present in the supplied weather context, and do not mention specific weather when weather context is absent or irrelevant to the question.",
    "9. When a `decisionContext` block is supplied, it is the DETERMINISTIC, already-computed recommendation. Treat its ranking, scores, decision factors, and missingSignals as fixed facts. Explain and phrase the recommendation in natural language, but NEVER re-rank, reorder, re-score, contradict, or override it. Do not promote a place the decision layer did not select.",
    "10. Only restate decision factors that are present in the block (e.g. budget, group, style, weather, quality, itinerary). NEVER invent a factor or a reason that is not listed, and when `missingSignals` is non-empty, be transparent that some context (such as weather, timing, or trip) was unavailable instead of guessing it.",
  ].join("\n");
}

function buildGeminiTripContext(trip: NonNullable<TravelContext["trip"]>): unknown {
  const plan = trip.plan;
  const report = trip.report;
  if (!plan) return undefined;
  const tripPlan = plan.trip;
  return {
    tripId: trip.tripId ?? tripPlan.id,
    title: tripPlan.title,
    destination: tripPlan.destinationName,
    destinationSlug: tripPlan.destinationSlug,
    startDate: tripPlan.startDate,
    endDate: tripPlan.endDate,
    totalDays: plan.days.length,
    plannedDays: plan.plannedDays,
    totalItems: plan.totalItems,
    unassignedPlaceCount: report?.summary.unassignedPlaceCount ?? Math.max(0, plan.places.length - plan.totalItems),
    report: report
      ? {
          summary: report.summary,
          issues: report.issues.slice(0, MAX_TRIP_ISSUES_IN_PROMPT).map((issue) => ({
            code: issue.code,
            severity: issue.severity,
            dayNumber: issue.dayNumber,
            message: issue.message,
          })),
        }
      : null,
  };
}

/**
 * Feature 20 — serialize the deterministic decision result as *grounded context*
 * only. Gemini never ranks or decides: it receives the already-computed order,
 * scores, and per-place decision factors, and its only job is to explain them.
 * The block is deliberately derived from `TravelDecisionResult` so no ranking can
 * be introduced or altered on the Gemini side.
 */
function buildGeminiDecisionContext(decision: TravelDecisionResult): unknown {
  return {
    decisionSource: "deterministic_decision_layer",
    authority:
      "This ranking is already computed and authoritative. Explain it in natural language. Do NOT re-rank, re-order, re-score, contradict, or override it.",
    summary: decision.summary,
    rankedPlaces: decision.rankedPlaces.slice(0, MAX_DECISION_PLACES_IN_PROMPT).map(
      (place, index) => ({
        rank: index + 1,
        placeId: place.placeId,
        score: place.score,
        decisionFactors: place.factors.map((factor) => ({
          kind: factor.kind,
          label: factor.label,
        })),
      })
    ),
    primaryPlaceId: decision.primary?.placeId ?? null,
    signalsUsed: {
      preferences: decision.usedPreferences,
      weather: decision.usedWeather,
      timing: decision.usedTiming,
      trip: decision.usedTrip,
      savedPlaces: decision.usedSavedPlaces,
    },
    timing: decision.timing,
    weatherFitPlaceIds: decision.weatherFitPlaceIds,
    scheduledPlaceIds: decision.scheduledPlaceIds,
    missingSignals: decision.missingSignals,
  };
}

export function buildGeminiUserPrompt(
  context: TravelContext,
  decisionContext?: TravelDecisionResult | null
): string {
  const { destination, user, query, conversation, places } = context;

  const candidateSummary = places.candidatePlaces.map((p, idx) => ({
    index: idx + 1,
    placeId: p.placeId,
    name: p.name,
    category: p.category,
    priceLevel: p.priceLevel,
    rating: p.rating,
    reviewCount: p.reviewCount,
    address: p.address,
    matchScore: p.matchScore,
    shortDescription: p.shortDescription || "No description provided",
    tags: p.tags,
    openingHours: p.openingHours || "Not specified",
  }));

  const recentHistory = conversation.recentTurns.map((t) => ({
    role: t.role,
    content: t.content,
  }));

  const tripContext = context.trip ? buildGeminiTripContext(context.trip) : undefined;

  const weatherContext = context.weather
    ? {
        destinationSlug: context.weather.destinationSlug,
        destinationName: context.weather.destinationName,
        retrievedAt: context.weather.retrievedAt,
        current: context.weather.current,
        forecast: context.weather.forecast,
        summary: context.weather.summary,
        weatherRelevance: isWeatherRelevantQuestion(query.message)
          ? "relevant"
          : "not_relevant",
      }
    : undefined;

  return JSON.stringify(
    {
      destinationContext: {
        name: destination.name,
        slug: context.destinationSlug,
        country: destination.country,
        description: destination.description,
        bestTimeToVisit: destination.bestTimeToVisit,
      },
      travellerPreferences: {
        styles: user.resolvedPreferences.styles || [],
        budget: user.resolvedPreferences.budget || "unspecified",
        group: user.resolvedPreferences.group || "unspecified",
        preferenceSource: user.preferenceSource,
      },
      selectedPlaceIds: context.places.selectedPlaceIds,
      groundedCandidatePlaces: candidateSummary,
      ...(tripContext ? { tripContext } : {}),
      ...(weatherContext ? { weatherContext } : {}),
      ...(decisionContext ? { decisionContext: buildGeminiDecisionContext(decisionContext) } : {}),
      recentConversationHistory: recentHistory,
      currentQuestion: query.message,
      inferredIntent: query.intent,
    },
    null,
    2
  );
}

const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description: "Natural, engaging, and strictly grounded conversational response.",
    },
    referencedPlaceIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of placeId strings from the candidate places that are recommended or discussed in the answer.",
    },
    placeReasons: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          placeId: { type: Type.STRING },
          reason: { type: Type.STRING, description: "Specific grounded reason why this place matches the traveller's query/preferences." },
        },
        required: ["placeId", "reason"],
      },
      description: "Grounded reasons for each referenced place.",
    },
    needsClarification: {
      type: Type.BOOLEAN,
      description: "Set to true if candidate places or information is insufficient to answer safely.",
    },
    clarificationQuestion: {
      type: Type.STRING,
      description: "Polite clarification question if needsClarification is true.",
    },
  },
  required: ["answer", "referencedPlaceIds", "needsClarification"],
};

export function parseGeminiJsonResponse(rawText: string): GeminiTravelPayload {
  const trimmed = rawText.trim();
  const cleaned = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(cleaned) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid response structure from Gemini API");
  }

  const obj = parsed as Record<string, unknown>;

  const answer = typeof obj.answer === "string" ? obj.answer.trim() : "";
  const referencedPlaceIds = Array.isArray(obj.referencedPlaceIds)
    ? (obj.referencedPlaceIds.filter((id) => typeof id === "string") as string[])
    : [];

  const placeReasons: Array<{ placeId: string; reason: string }> = [];
  if (Array.isArray(obj.placeReasons)) {
    for (const item of obj.placeReasons) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.placeId === "string" &&
        typeof item.reason === "string"
      ) {
        placeReasons.push({ placeId: item.placeId, reason: item.reason });
      }
    }
  }

  const needsClarification = Boolean(obj.needsClarification);
  const clarificationQuestion =
    typeof obj.clarificationQuestion === "string" ? obj.clarificationQuestion.trim() : undefined;

  return {
    answer,
    referencedPlaceIds,
    placeReasons,
    needsClarification,
    clarificationQuestion,
  };
}

export async function callGeminiForTravel(
  context: TravelContext,
  apiKey: string,
  decisionContext?: TravelDecisionResult | null
): Promise<GeminiTravelPayload> {
  const client = getGeminiClient(apiKey);
  const systemInstruction = buildGeminiSystemInstruction();
  const userPrompt = buildGeminiUserPrompt(context, decisionContext);

  // Built once and reused across retries so every attempt is byte-identical.
  const request = {
    model: "gemini-3.7-flash",
    contents: userPrompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: geminiResponseSchema,
      temperature: 0.2,
    },
  };

  const maxAttempts = retryDelaysMs.length + 1;
  let response: { text?: string | null } | undefined;

  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await client.models.generateContent(request);
      break;
    } catch (error) {
      // Re-throw immediately unless this is a temporary 503/UNAVAILABLE and we
      // still have retries left. The original error propagates unchanged.
      if (!isRetryableGeminiError(error) || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(retryDelaysMs[attempt - 1]);
    }
  }

  const text = response.text;
  if (!text) {
    throw new Error("Empty response returned by Gemini API");
  }

  return parseGeminiJsonResponse(text);
}

export function buildGeminiGroundedResponse(input: {
  context: TravelContext;
  geminiPayload: GeminiTravelPayload;
  createdAt: string;
}): AssistantResponseEnvelope {
  const { context, geminiPayload, createdAt } = input;
  const candidatePlaceMap = new Map<string, AssistantCandidatePlace>();
  for (const place of context.places.candidatePlaces) {
    candidatePlaceMap.set(place.placeId, place);
  }

  const candidatePlaceIds = context.places.candidatePlaces.map((p) => p.placeId);

  // Validate all referenced place IDs returned by Gemini against grounded candidates
  const validation = validateGroundedPlaceReferences(
    candidatePlaceIds,
    geminiPayload.referencedPlaceIds
  );

  // Requirement 13: If Gemini returns unsupported place references, do not allow bypass.
  if (!validation.isValid) {
    const question =
      "I could not safely ground that recommendation to the retrieved places. Please try a narrower question or adjust your filters.";
    const assistantTurn: AssistantTurn = {
      id: `assistant_${context.requestId}`,
      role: "assistant",
      content: question,
      createdAt,
      intent: "clarify",
      metadata: {
        source: "assistant",
        grounded: true,
      },
    };

    return {
      requestId: context.requestId,
      destinationSlug: context.destinationSlug,
      conversationId: context.conversation.conversationId,
      createdAt,
      intent: "clarify",
      answer: question,
      assistantTurn,
      referencedPlaces: [],
      highlightedPlaceIds: [],
      needsClarification: true,
      clarificationQuestion: question,
      grounding: {
        candidatePlaceIds,
        selectedPlaceIds: context.places.selectedPlaceIds,
        referencedPlaceIds: [],
        rejectedPlaceIds: [...context.grounding.rejectedPlaceIds, ...validation.rejectedPlaceIds],
        usedFallback: true,
      },
      preferenceUsage: {
        usedProfile: context.user.preferenceSource === "profile" || context.user.preferenceSource === "merged",
        usedUrl: context.user.preferenceSource === "url" || context.user.preferenceSource === "merged",
        usedChat: context.user.preferenceSource === "chat" || context.user.preferenceSource === "merged",
      },
    };
  }

  if (geminiPayload.needsClarification && !geminiPayload.referencedPlaceIds.length) {
    const question =
      geminiPayload.clarificationQuestion ||
      geminiPayload.answer ||
      `I can help with recommendations, comparisons, or highlights for ${context.destination.name}. What would you like to explore?`;

    const assistantTurn: AssistantTurn = {
      id: `assistant_${context.requestId}`,
      role: "assistant",
      content: question,
      createdAt,
      intent: "clarify",
      metadata: {
        source: "assistant",
        grounded: true,
      },
    };

    return {
      requestId: context.requestId,
      destinationSlug: context.destinationSlug,
      conversationId: context.conversation.conversationId,
      createdAt,
      intent: "clarify",
      answer: question,
      assistantTurn,
      referencedPlaces: [],
      highlightedPlaceIds: [],
      needsClarification: true,
      clarificationQuestion: question,
      grounding: {
        candidatePlaceIds,
        selectedPlaceIds: context.places.selectedPlaceIds,
        referencedPlaceIds: [],
        rejectedPlaceIds: context.grounding.rejectedPlaceIds,
        usedFallback: context.grounding.usedFallback,
      },
      preferenceUsage: {
        usedProfile: context.user.preferenceSource === "profile" || context.user.preferenceSource === "merged",
        usedUrl: context.user.preferenceSource === "url" || context.user.preferenceSource === "merged",
        usedChat: context.user.preferenceSource === "chat" || context.user.preferenceSource === "merged",
      },
    };
  }

  const referencedPlaces: AssistantResponseReferencePlace[] = [];
  const reasonMap = new Map<string, string>();
  if (geminiPayload.placeReasons) {
    for (const r of geminiPayload.placeReasons) {
      reasonMap.set(r.placeId, r.reason);
    }
  }

  for (const placeId of validation.validPlaceIds) {
    const place = candidatePlaceMap.get(placeId);
    if (place) {
      const specificReason =
        reasonMap.get(placeId) ||
        (typeof place.matchScore === "number"
          ? `Recommended option with ${place.matchScore}/100 match score for your preferences.`
          : `Grounded option for ${place.destination}.`);

      referencedPlaces.push({
        placeId: place.placeId,
        slug: place.slug,
        name: place.name,
        reason: specificReason,
        matchScore: place.matchScore,
        coordinates: place.coordinates,
        category: place.category,
      });
    }
  }

  const primaryPlace = referencedPlaces[0];
  const referencedPlaceIds = referencedPlaces.map((p) => p.placeId);

  const assistantTurn: AssistantTurn = {
    id: `assistant_${context.requestId}`,
    role: "assistant",
    content: geminiPayload.answer,
    createdAt,
    intent: context.query.intent,
    referencedPlaceIds,
    metadata: {
      source: "assistant",
      grounded: true,
    },
  };

  return {
    requestId: context.requestId,
    destinationSlug: context.destinationSlug,
    conversationId: context.conversation.conversationId,
    createdAt,
    intent: context.query.intent,
    answer: geminiPayload.answer,
    assistantTurn,
    referencedPlaces,
    primaryPlaceId: primaryPlace?.placeId,
    highlightedPlaceIds: referencedPlaceIds,
    mapFocusPlaceId: primaryPlace?.placeId,
    needsClarification: geminiPayload.needsClarification,
    clarificationQuestion: geminiPayload.clarificationQuestion,
    grounding: {
      candidatePlaceIds,
      selectedPlaceIds: context.places.selectedPlaceIds,
      referencedPlaceIds,
      rejectedPlaceIds: context.grounding.rejectedPlaceIds,
      usedFallback: context.grounding.usedFallback,
    },
    preferenceUsage: {
      usedProfile: context.user.preferenceSource === "profile" || context.user.preferenceSource === "merged",
      usedUrl: context.user.preferenceSource === "url" || context.user.preferenceSource === "merged",
      usedChat: context.user.preferenceSource === "chat" || context.user.preferenceSource === "merged",
    },
  };
}
