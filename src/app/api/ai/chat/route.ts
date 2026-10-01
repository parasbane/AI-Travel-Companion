import { NextResponse } from "next/server";
import { PlaceProvider } from "@/lib/places/provider";
import { buildTravelContext, normalizeDestinationSlug, resolveAssistantPreferences } from "@/lib/ai/travelContext";
import { loadTripContext } from "@/lib/ai/tripContext";
import { buildChatItineraryProposal } from "@/lib/ai/chatItinerary";
import { groundCandidatePlaces, validateGroundedPlaceReferences, MAX_GROUNDED_CANDIDATES } from "@/lib/ai/grounding";
import { buildGeminiGroundedResponse, callGeminiForTravel } from "@/lib/ai/gemini";
import {
  buildTravelDecision,
  parseRequestedTiming,
  toAssistantDecisionSummary,
} from "@/lib/ai/travelDecision";
import { buildAiWeatherContext } from "@/lib/ai/weatherContext";
import { getDestinationWeather } from "@/lib/weather/service";
import type { DestinationWeatherResponse } from "@/lib/weather/types";
import type {
  AssistantCandidatePlace,
  AssistantChatApiResponse,
  AssistantChatErrorResponse,
  AssistantChatRequest,
  AssistantIntent,
  AssistantResponseEnvelope,
  AssistantResponseReferencePlace,
  AssistantTurn,
} from "@/lib/ai/types";
import type { TravelDecisionResult } from "@/lib/ai/travelDecision";

/**
 * Test seam mirroring setGeminiClientForTesting: swap in a deterministic
 * weather fetcher so route tests never hit the live weather provider. Restoring
 * with null wraps the real service again.
 */
export type ChatWeatherFetcher = (slug: string) => Promise<DestinationWeatherResponse>;

let chatWeatherFetcher: ChatWeatherFetcher = (slug: string) => getDestinationWeather(slug);

export function setChatWeatherFetcherForTesting(fetcher: ChatWeatherFetcher | null): void {
  chatWeatherFetcher = fetcher ?? ((slug: string) => getDestinationWeather(slug));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAssistantIntent(value: unknown): value is AssistantIntent {
  return (
    value === "recommend" ||
    value === "compare" ||
    value === "explain" ||
    value === "shortlist" ||
    value === "clarify" ||
    value === "trip_focus" ||
    value === "decision" ||
    value === "unknown"
  );
}

function isPreferenceObject(value: unknown): value is AssistantChatRequest["urlPreferences"] {
  if (value == null) return true;
  if (!isRecord(value)) return false;

  const stylesValid = value.styles === undefined || isStringArray(value.styles);
  const budgetValid =
    value.budget === undefined ||
    value.budget === "budget" ||
    value.budget === "balanced" ||
    value.budget === "luxury";
  const groupValid =
    value.group === undefined ||
    value.group === "solo" ||
    value.group === "couple" ||
    value.group === "family" ||
    value.group === "friends";

  return stylesValid && budgetValid && groupValid;
}

export function validateAssistantChatRequest(
  body: unknown
):
  | { ok: true; value: AssistantChatRequest }
  | { ok: false; status: number; error: AssistantChatErrorResponse["error"] } {
  if (!isRecord(body)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    };
  }

  const destinationSlug = typeof body.destinationSlug === "string" ? body.destinationSlug.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!destinationSlug || !message) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_REQUEST",
        message: "destinationSlug and message are required.",
      },
    };
  }

  const recentTurns =
    body.recentTurns === undefined
      ? undefined
      : Array.isArray(body.recentTurns) &&
          body.recentTurns.every(
            (turn) =>
              isRecord(turn) &&
              typeof turn.role === "string" &&
              typeof turn.content === "string" &&
              (turn.id === undefined || typeof turn.id === "string") &&
              (turn.createdAt === undefined || typeof turn.createdAt === "string") &&
              (turn.intent === undefined || isAssistantIntent(turn.intent)) &&
              (turn.referencedPlaceIds === undefined || isStringArray(turn.referencedPlaceIds)) &&
              (turn.metadata === undefined || isRecord(turn.metadata))
          )
        ? (body.recentTurns as AssistantChatRequest["recentTurns"])
        : null;

  if (recentTurns === null) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_REQUEST",
        message: "recentTurns must be an array of assistant turns when provided.",
      },
    };
  }

  if (body.selectedPlaceIds !== undefined && !isStringArray(body.selectedPlaceIds)) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_REQUEST",
        message: "selectedPlaceIds must be an array of strings when provided.",
      },
    };
  }

  if (
    !isPreferenceObject(body.urlPreferences) ||
    !isPreferenceObject(body.profilePreferences) ||
    !isPreferenceObject(body.chatPreferences)
  ) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "INVALID_REQUEST",
        message: "Preference objects must use supported budget, group, and styles values.",
      },
    };
  }

  return {
    ok: true,
    value: {
      requestId: typeof body.requestId === "string" ? body.requestId : undefined,
      destinationSlug,
      userId: typeof body.userId === "string" ? body.userId.trim() : undefined,
      tripId: typeof body.tripId === "string" ? body.tripId.trim() : undefined,
      message,
      recentTurns: recentTurns ?? undefined,
      selectedPlaceIds: isStringArray(body.selectedPlaceIds) ? body.selectedPlaceIds : undefined,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      urlPreferences: body.urlPreferences,
      profilePreferences: body.profilePreferences,
      chatPreferences: body.chatPreferences,
      locale: typeof body.locale === "string" ? body.locale : undefined,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      currentPath: typeof body.currentPath === "string" ? body.currentPath : undefined,
    },
  };
}

function pickGroundedPlaces(
  candidates: AssistantCandidatePlace[],
  selectedPlaceIds: string[],
  intent: AssistantIntent
): AssistantCandidatePlace[] {
  if (selectedPlaceIds.length > 0) {
    const selected = selectedPlaceIds
      .map((placeId) => candidates.find((candidate) => candidate.placeId === placeId))
      .filter((candidate): candidate is AssistantCandidatePlace => Boolean(candidate));

    if (selected.length > 0) {
      return selected;
    }
  }

  if (intent === "compare") {
    return candidates.slice(0, 2);
  }

  if (intent === "shortlist") {
    return candidates.slice(0, 3);
  }

  return candidates.slice(0, 1);
}

function describePreferenceSignal(place: AssistantCandidatePlace): string {
  const scoreText =
    typeof place.matchScore === "number"
      ? `a ${place.matchScore}/100 match score`
      : "a grounded editorial ranking";
  const timingText = place.openingHours ? ` Its listed hours are ${place.openingHours}.` : "";
  return `${place.name} is the strongest grounded option here with ${scoreText}.${timingText}`;
}

function buildClarificationResponse(context: {
  requestId: string;
  destinationSlug: string;
  conversationId?: string;
  createdAt: string;
  assistantTurnId: string;
  intent: AssistantIntent;
  question: string;
  candidatePlaceIds: string[];
  selectedPlaceIds: string[];
  rejectedPlaceIds: string[];
  usedFallback: boolean;
  preferenceUsage: AssistantResponseEnvelope["preferenceUsage"];
}): AssistantResponseEnvelope {
  const assistantTurn: AssistantTurn = {
    id: context.assistantTurnId,
    role: "assistant",
    content: context.question,
    createdAt: context.createdAt,
    intent: "clarify",
    metadata: {
      source: "assistant",
      grounded: true,
    },
  };

  return {
    requestId: context.requestId,
    destinationSlug: context.destinationSlug,
    conversationId: context.conversationId,
    createdAt: context.createdAt,
    intent: context.intent,
    answer: context.question,
    assistantTurn,
    referencedPlaces: [],
    highlightedPlaceIds: [],
    needsClarification: true,
    clarificationQuestion: context.question,
    grounding: {
      candidatePlaceIds: context.candidatePlaceIds,
      selectedPlaceIds: context.selectedPlaceIds,
      referencedPlaceIds: [],
      rejectedPlaceIds: context.rejectedPlaceIds,
      usedFallback: context.usedFallback,
    },
    preferenceUsage: context.preferenceUsage,
  };
}

function buildGroundedResponse(input: {
  requestId: string;
  destinationSlug: string;
  conversationId?: string;
  createdAt: string;
  contextIntent: AssistantIntent;
  candidatePlaces: AssistantCandidatePlace[];
  selectedPlaceIds: string[];
  rejectedPlaceIds: string[];
  preferenceUsage: AssistantResponseEnvelope["preferenceUsage"];
  usedFallback: boolean;
  hasTripContext?: boolean;
  tripSummary?: string;
}): AssistantResponseEnvelope {
  const focusedPlaces = pickGroundedPlaces(
    input.candidatePlaces,
    input.selectedPlaceIds,
    input.contextIntent
  );
  const primaryPlace = focusedPlaces[0];

  if (!primaryPlace) {
    return buildClarificationResponse({
      requestId: input.requestId,
      destinationSlug: input.destinationSlug,
      conversationId: input.conversationId,
      createdAt: input.createdAt,
      assistantTurnId: `assistant_${input.requestId}`,
      intent: "clarify",
      question:
        "I need a grounded place set for this destination before I can answer. Please try another destination or adjust your filters.",
      candidatePlaceIds: input.candidatePlaces.map((place) => place.placeId),
      selectedPlaceIds: input.selectedPlaceIds,
      rejectedPlaceIds: input.rejectedPlaceIds,
      usedFallback: true,
      preferenceUsage: input.preferenceUsage,
    });
  }

  const referencedPlaces: AssistantResponseReferencePlace[] = [];
  let answer = "";
  let clarificationQuestion: string | undefined;
  let needsClarification = false;

  if (input.contextIntent === "compare") {
    if (focusedPlaces.length < 2) {
      return buildClarificationResponse({
        requestId: input.requestId,
        destinationSlug: input.destinationSlug,
        conversationId: input.conversationId,
        createdAt: input.createdAt,
        assistantTurnId: `assistant_${input.requestId}`,
        intent: "clarify",
        question: "I can compare two grounded places, but I only have one usable candidate right now. Please narrow the destination or change filters.",
        candidatePlaceIds: input.candidatePlaces.map((place) => place.placeId),
        selectedPlaceIds: input.selectedPlaceIds,
        rejectedPlaceIds: input.rejectedPlaceIds,
        usedFallback: true,
        preferenceUsage: input.preferenceUsage,
      });
    }

    const secondaryPlace = focusedPlaces[1];
    referencedPlaces.push(
      {
        placeId: primaryPlace.placeId,
        slug: primaryPlace.slug,
        name: primaryPlace.name,
        reason: `Best grounded option for your current preferences${typeof primaryPlace.matchScore === "number" ? ` (${primaryPlace.matchScore}/100 match score)` : ""}.`,
        matchScore: primaryPlace.matchScore,
        coordinates: primaryPlace.coordinates,
        category: primaryPlace.category,
      },
      {
        placeId: secondaryPlace.placeId,
        slug: secondaryPlace.slug,
        name: secondaryPlace.name,
        reason: `Second grounded option for comparison${typeof secondaryPlace.matchScore === "number" ? ` (${secondaryPlace.matchScore}/100 match score)` : ""}.`,
        matchScore: secondaryPlace.matchScore,
        coordinates: secondaryPlace.coordinates,
        category: secondaryPlace.category,
      }
    );
    answer = `${primaryPlace.name} is the stronger grounded pick, while ${secondaryPlace.name} gives you a different but still relevant option. ${describePreferenceSignal(primaryPlace)}${secondaryPlace.shortDescription ? ` ${secondaryPlace.name} is described as ${secondaryPlace.shortDescription}.` : ""}`;
  } else if (input.contextIntent === "shortlist") {
    const shortlistPlaces = focusedPlaces.slice(0, 3);
    shortlistPlaces.forEach((place, index) => {
      referencedPlaces.push({
        placeId: place.placeId,
        slug: place.slug,
        name: place.name,
        reason: index === 0 ? "Top grounded shortlist option." : `Additional grounded shortlist option #${index + 1}.`,
        matchScore: place.matchScore,
        coordinates: place.coordinates,
        category: place.category,
      });
    });
    const names = shortlistPlaces.map((place) => place.name);
    answer =
      names.length === 1
        ? `${names[0]} is the best grounded shortlist option for your current preferences.`
        : `The strongest grounded shortlist for ${input.destinationSlug} is ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`;
  } else if (input.contextIntent === "explain") {
    referencedPlaces.push({
      placeId: primaryPlace.placeId,
      slug: primaryPlace.slug,
      name: primaryPlace.name,
      reason: "Chosen because it is the strongest grounded option for the current preference set.",
      matchScore: primaryPlace.matchScore,
      coordinates: primaryPlace.coordinates,
      category: primaryPlace.category,
    });
    answer = `${primaryPlace.name} is the grounded recommendation because it aligns best with the current preferences. ${describePreferenceSignal(primaryPlace)}`;
  } else if (input.contextIntent === "recommend") {
    referencedPlaces.push({
      placeId: primaryPlace.placeId,
      slug: primaryPlace.slug,
      name: primaryPlace.name,
      reason: "Primary grounded recommendation.",
      matchScore: primaryPlace.matchScore,
      coordinates: primaryPlace.coordinates,
      category: primaryPlace.category,
    });
    answer = `For ${input.destinationSlug}, I would start with ${primaryPlace.name}. ${describePreferenceSignal(primaryPlace)}`;
  } else if (input.contextIntent === "trip_focus") {
    if (input.hasTripContext && input.tripSummary) {
      answer = input.tripSummary;
    } else {
      needsClarification = true;
      clarificationQuestion = `I can draft a trip itinerary when you open the trip you own and ask me there, or I can ground place recommendations from this destination. Would you like the best ${primaryPlace.category} or ${primaryPlace.destinationSlug} spot instead?`;
      answer = clarificationQuestion;
    }
  } else if (input.contextIntent === "clarify" || input.contextIntent === "unknown") {
    needsClarification = true;
    clarificationQuestion = `I can help with recommendations, comparisons, or explanations for ${input.destinationSlug}. What would you like to do?`;
    answer = clarificationQuestion;
  } else {
    referencedPlaces.push({
      placeId: primaryPlace.placeId,
      slug: primaryPlace.slug,
      name: primaryPlace.name,
      reason: "Primary grounded recommendation.",
      matchScore: primaryPlace.matchScore,
      coordinates: primaryPlace.coordinates,
      category: primaryPlace.category,
    });
    answer = `${primaryPlace.name} is the best grounded option available right now.`;
  }

  const referencedPlaceIds = referencedPlaces.map((place) => place.placeId);
  const validation = validateGroundedPlaceReferences(
    input.candidatePlaces.map((place) => place.placeId),
    referencedPlaceIds
  );

  if (!validation.isValid) {
    return buildClarificationResponse({
      requestId: input.requestId,
      destinationSlug: input.destinationSlug,
      conversationId: input.conversationId,
      createdAt: input.createdAt,
      assistantTurnId: `assistant_${input.requestId}`,
      intent: "clarify",
      question: "I could not safely ground that response to the retrieved places. Please try a narrower question.",
      candidatePlaceIds: input.candidatePlaces.map((place) => place.placeId),
      selectedPlaceIds: input.selectedPlaceIds,
      rejectedPlaceIds: [...input.rejectedPlaceIds, ...validation.rejectedPlaceIds],
      usedFallback: true,
      preferenceUsage: input.preferenceUsage,
    });
  }

  const assistantTurn: AssistantTurn = {
    id: `assistant_${input.requestId}`,
    role: "assistant",
    content: answer,
    createdAt: input.createdAt,
    intent: input.contextIntent,
    referencedPlaceIds,
    metadata: {
      source: "assistant",
      grounded: true,
    },
  };

  return {
    requestId: input.requestId,
    destinationSlug: input.destinationSlug,
    conversationId: input.conversationId,
    createdAt: input.createdAt,
    intent: input.contextIntent,
    answer,
    assistantTurn,
    referencedPlaces,
    primaryPlaceId: primaryPlace.placeId,
    highlightedPlaceIds: referencedPlaceIds,
    mapFocusPlaceId: primaryPlace.placeId,
    needsClarification,
    clarificationQuestion,
    grounding: {
      candidatePlaceIds: input.candidatePlaces.map((place) => place.placeId),
      selectedPlaceIds: input.selectedPlaceIds,
      referencedPlaceIds,
      rejectedPlaceIds: input.rejectedPlaceIds,
      usedFallback: input.usedFallback,
    },
    preferenceUsage: input.preferenceUsage,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = validateAssistantChatRequest(body);

    if (!parsed.ok) {
      return NextResponse.json(parsed, { status: parsed.status });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "MISSING_API_KEY",
            message: "Gemini API key is not configured.",
          },
        } satisfies AssistantChatApiResponse,
        { status: 500 }
      );
    }

    const requestId = parsed.value.requestId?.trim() || crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const destinationSlug = normalizeDestinationSlug(parsed.value.destinationSlug);
    const preferenceResolution = resolveAssistantPreferences({
      profilePreferences: parsed.value.profilePreferences,
      urlPreferences: parsed.value.urlPreferences,
      chatPreferences: parsed.value.chatPreferences,
    });

    const tripContext = await loadTripContext(parsed.value.userId, parsed.value.tripId);

    const destinationResponse = await PlaceProvider.getDestinationPlaces(destinationSlug, {
      category: "all",
      sort: "recommended",
      preferences: preferenceResolution.resolvedPreferences,
    });

    const groundingResult = groundCandidatePlaces({
      places: destinationResponse.places,
      selectedPlaceIds: parsed.value.selectedPlaceIds,
      maxCandidates: MAX_GROUNDED_CANDIDATES,
    });

    // Grounded weather for this destination (server-side via the existing
    // weather service). Always degrades gracefully: unavailable weather simply
    // yields null context — the AI keeps working from grounded places.
    const weatherResponse =
      groundingResult.candidatePlaces.length > 0
        ? await chatWeatherFetcher(destinationSlug)
        : null;
    const weather = weatherResponse ? buildAiWeatherContext(weatherResponse) : null;

    const context = buildTravelContext({
      requestId,
      destinationSlug,
      destination: destinationResponse.destination,
      message: parsed.value.message,
      recentTurns: parsed.value.recentTurns,
      selectedPlaceIds: parsed.value.selectedPlaceIds,
      conversationId: parsed.value.conversationId,
      locale: parsed.value.locale,
      timezone: parsed.value.timezone,
      currentPath: parsed.value.currentPath,
      nowIso,
      preferenceResolution,
      candidatePlaces: groundingResult.candidatePlaces,
      grounding: groundingResult.grounding,
      tripId: tripContext?.tripId,
      tripPlan: tripContext?.plan,
      tripPlanReport: tripContext?.report,
      weather,
    });

    // If there are no candidate places at all, return safe clarification
    if (groundingResult.candidatePlaces.length === 0) {
      const fallbackEnvelope = buildClarificationResponse({
        requestId: context.requestId,
        destinationSlug: context.destinationSlug,
        conversationId: context.conversation.conversationId,
        createdAt: nowIso,
        assistantTurnId: `assistant_${context.requestId}`,
        intent: "clarify",
        question:
          "I need a grounded place set for this destination before I can answer. Please try another destination or adjust your filters.",
        candidatePlaceIds: [],
        selectedPlaceIds: context.places.selectedPlaceIds,
        rejectedPlaceIds: groundingResult.rejectedPlaceIds,
        usedFallback: true,
        preferenceUsage: {
          usedProfile: preferenceResolution.usedProfile,
          usedUrl: preferenceResolution.usedUrl,
          usedChat: preferenceResolution.usedChat,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          data: fallbackEnvelope,
        } satisfies AssistantChatApiResponse,
        { status: 200 }
      );
    }

    // Feature 20 — for a "decision" turn, the deterministic decision layer is the
    // source of truth: it ranks the already-grounded candidates and records the
    // factors behind each pick. Gemini only receives that result as context to
    // explain — it never ranks, rescore, or override it. Every other intent is
    // passed through unchanged with no decision context at all.
    let decisionContext: TravelDecisionResult | null = null;
    if (context.query.intent === "decision") {
      const scheduledPlaceIds = (tripContext?.plan?.days ?? []).flatMap((day) =>
        day.items.map((entry) => entry.item.placeId)
      );

      decisionContext = buildTravelDecision({
        destinationSlug: context.destinationSlug,
        destinationName: context.destination.name,
        candidatePlaces: context.places.candidatePlaces,
        preferences: context.user.resolvedPreferences,
        weather: context.weather,
        scheduledPlaceIds,
        timing: parseRequestedTiming(context.query.message, nowIso),
        nowIso,
      });
    }

    let geminiPayload;
    try {
      geminiPayload = await callGeminiForTravel(context, apiKey, decisionContext);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(
        `Gemini invocation failed${tripContext ? " (trip context loaded)" : " (no trip context)"}: ${detail}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "AI_SERVICE_ERROR",
            message: "Failed to generate travel recommendations.",
          },
        } satisfies AssistantChatApiResponse,
        { status: 500 }
      );
    }

    const response = buildGeminiGroundedResponse({
      context,
      geminiPayload,
      createdAt: nowIso,
    });

    // For a trip_focus turn from a signed-in user who owns a trip, attach a
    // deterministic itinerary proposal so the client can offer "apply to trip".
    // The proposal is built entirely from owned server data and reuses the same
    // planner as POST /api/ai/itinerary; any failure simply omits it (null) and
    // never breaks the grounded answer.
    let data = response;
    if (
      response.intent === "trip_focus" &&
      tripContext &&
      parsed.value.userId &&
      parsed.value.tripId
    ) {
      const itineraryProposal = await buildChatItineraryProposal({
        userId: parsed.value.userId,
        tripId: parsed.value.tripId,
        instruction: parsed.value.message,
        preferences: preferenceResolution.resolvedPreferences,
        weather,
      });
      if (itineraryProposal) {
        data = { ...response, itineraryProposal };
      }
    }

    // Feature 20 — surface the deterministic decision to the client for a
    // "decision" turn. This is a verbatim copy of the decision layer result:
    // Gemini supplied only the `answer` prose above and cannot reorder it.
    if (decisionContext) {
      const decisionSummary = toAssistantDecisionSummary(
        decisionContext,
        context.places.candidatePlaces,
      );
      const selectedPlaceId = decisionSummary.selectedPlaceId;
      const selectedDecision = decisionContext.primary;

      // Ground the deterministic pick. If Gemini referenced it, reuse that
      // entry (keeping its prose reason); otherwise synthesise a reference from
      // the grounded candidate so the client always has a card for the pick.
      // Never introduce a place that is not in the grounded candidate set.
      const existingReference = selectedPlaceId
        ? response.referencedPlaces.find((p) => p.placeId === selectedPlaceId)
        : undefined;
      const groundedSelected =
        selectedPlaceId && !existingReference
          ? context.places.candidatePlaces.find((p) => p.placeId === selectedPlaceId)
          : undefined;

      let referencedPlaces = response.referencedPlaces;
      if (selectedPlaceId && !existingReference && groundedSelected) {
        const factors = selectedDecision?.factors ?? [];
        referencedPlaces = [
          {
            placeId: groundedSelected.placeId,
            slug: groundedSelected.slug,
            name: groundedSelected.name,
            reason:
              factors.length > 0
                ? `Top deterministic match: ${factors.map((f) => f.label).join("; ")}.`
                : `Top deterministic match for your preferences.`,
            matchScore: groundedSelected.matchScore,
            coordinates: groundedSelected.coordinates,
            category: groundedSelected.category,
          },
          ...response.referencedPlaces,
        ];
      }

      // Make the deterministic pick lead the references so the model cannot
      // swap the selection by referencing a different place first.
      if (selectedPlaceId) {
        referencedPlaces = [
          ...referencedPlaces.filter((p) => p.placeId === selectedPlaceId),
          ...referencedPlaces.filter((p) => p.placeId !== selectedPlaceId),
        ];
      }

      data = {
        ...data,
        referencedPlaces,
        primaryPlaceId: selectedPlaceId ?? data.primaryPlaceId,
        mapFocusPlaceId: selectedPlaceId ?? data.mapFocusPlaceId,
        highlightedPlaceIds: selectedPlaceId
          ? Array.from(new Set([selectedPlaceId, ...data.highlightedPlaceIds]))
          : data.highlightedPlaceIds,
        decisionSummary,
      };
    }

    const payload: AssistantChatApiResponse = {
      ok: true,
      data,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch {
    console.error("AI chat route failed");
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to process assistant chat request.",
        },
      } satisfies AssistantChatApiResponse,
      { status: 500 }
    );
  }
}

export { buildClarificationResponse, buildGroundedResponse };
