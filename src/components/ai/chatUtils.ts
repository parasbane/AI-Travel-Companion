import type {
  AssistantChatRequest,
  AssistantResponseEnvelope,
  AssistantTurn,
  RecommendationPreferences,
} from "@/lib/ai/types";

export interface AssistantPreferenceContext {
  profilePreferences?: RecommendationPreferences;
  urlPreferences?: RecommendationPreferences;
  chatPreferences?: RecommendationPreferences;
  resolvedPreferences?: RecommendationPreferences;
}

export interface BuildAssistantChatRequestInput {
  destinationSlug: string;
  userId?: string;
  tripId?: string;
  message: string;
  recentTurns: AssistantTurn[];
  selectedPlaceIds?: string[];
  preferenceContext?: AssistantPreferenceContext;
  requestId?: string;
  conversationId?: string;
  locale?: string;
  timezone?: string;
  currentPath?: string;
  maxRecentTurns?: number;
}

function hasPreferenceSignal(preferences: RecommendationPreferences | undefined): boolean {
  return Boolean(
    preferences &&
      ((preferences.styles?.length ?? 0) > 0 || preferences.budget || preferences.group)
  );
}

function normalizeTurn(turn: AssistantTurn): AssistantTurn {
  return {
    ...turn,
    content: turn.content.trim(),
    referencedPlaceIds: turn.referencedPlaceIds?.map((id) => id.trim()).filter(Boolean),
  };
}

export function buildAssistantChatRequestPayload(
  input: BuildAssistantChatRequestInput
): AssistantChatRequest {
  const maxRecentTurns = Math.max(0, input.maxRecentTurns ?? 6);
  const recentTurns = input.recentTurns
    .slice(-maxRecentTurns)
    .map(normalizeTurn)
    .filter((turn) => turn.content.length > 0);

  const payload: AssistantChatRequest = {
    destinationSlug: input.destinationSlug.trim(),
    userId: input.userId?.trim() || undefined,
    tripId: input.tripId?.trim() || undefined,
    message: input.message.trim(),
    recentTurns,
    selectedPlaceIds:
      input.selectedPlaceIds?.map((id) => id.trim()).filter(Boolean).length
        ? input.selectedPlaceIds.map((id) => id.trim()).filter(Boolean)
        : undefined,
    requestId: input.requestId?.trim() || undefined,
    conversationId: input.conversationId?.trim() || undefined,
    locale: input.locale?.trim() || undefined,
    timezone: input.timezone?.trim() || undefined,
    currentPath: input.currentPath?.trim() || undefined,
  };

  const preferenceContext = input.preferenceContext;

  if (hasPreferenceSignal(preferenceContext?.profilePreferences)) {
    payload.profilePreferences = preferenceContext?.profilePreferences;
  }
  if (hasPreferenceSignal(preferenceContext?.urlPreferences)) {
    payload.urlPreferences = preferenceContext?.urlPreferences;
  }
  if (hasPreferenceSignal(preferenceContext?.chatPreferences)) {
    payload.chatPreferences = preferenceContext?.chatPreferences;
  }

  return payload;
}

export function getAssistantResponseReferenceLabels(
  response: AssistantResponseEnvelope
): string[] {
  return response.referencedPlaces.map((place) => place.name);
}

export interface AssistantDecisionView {
  selectedPlaceId?: string;
  selectedPlaceName?: string;
  /** Deterministic factor labels for the selected place, in decision order. */
  reasons: string[];
  /** Deterministic summary line, already ending in a full stop. */
  summary: string;
  /** Honest note about which context was unavailable, if any. */
  unavailableNote?: string;
  /** Other ranked places, shown as context (never as the selection). */
  alternatives: Array<{ placeId: string; placeName: string; score: number }>;
}

const MISSING_SIGNAL_TEXT: Record<string, string> = {
  weather: "weather",
  timing: "the day you mentioned",
  trip: "your trip",
  preferences: "your preferences",
};

/**
 * Builds the render-ready view of a decision response. Pure and defensive:
 * the UI never re-ranks or re-derives anything, it only formats the values the
 * decision layer already produced. Returns null when there is no decision to
 * show, so callers can fall back to the normal bubble.
 */
export function buildAssistantDecisionView(
  response: AssistantResponseEnvelope | null | undefined
): AssistantDecisionView | null {
  const decision = response?.decisionSummary;
  if (!decision) return null;

  const selected = decision.rankedPlaces.find(
    (place) => place.placeId === decision.selectedPlaceId
  );

  return {
    selectedPlaceId: decision.selectedPlaceId,
    selectedPlaceName:
      decision.selectedPlaceName ?? selected?.placeName ?? response?.primaryPlaceId,
    reasons: (selected?.factors ?? []).map((factor) => factor.label).filter(Boolean),
    summary: decision.summary,
    unavailableNote:
      decision.missingSignals.length > 0
        ? `I don't have ${decision.missingSignals
            .map((signal) => MISSING_SIGNAL_TEXT[signal] ?? signal)
            .join(" or ")} context, so I didn't guess.`
        : undefined,
    alternatives: decision.rankedPlaces
      .filter((place) => place.placeId !== decision.selectedPlaceId)
      .map((place) => ({
        placeId: place.placeId,
        placeName: place.placeName,
        score: place.score,
      })),
  };
}
