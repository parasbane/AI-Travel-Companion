import { formatDestinationSlug } from "@/lib/utils/slug";
import { parseStylesQueryParam } from "@/lib/places/scoring";
import type { DestinationInfo } from "@/lib/places/types";
import type { TripPlan, TripPlanReport } from "@/lib/saved/types";
import type { AiWeatherContext } from "./weatherContext";
import type {
  AssistantCandidatePlace,
  AssistantGroundingState,
  AssistantIntent,
  AssistantPreferenceResolution,
  AssistantPreferenceSource,
  AssistantTurn,
  AssistantTurnInput,
  RecommendationPreferences,
  TravelContext,
} from "./types";

const MAX_RECENT_TURNS = 6;

function normalizeMessage(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeDestinationSlug(input: string): string {
  const formatted = formatDestinationSlug(input);
  return formatted || input.trim().toLowerCase();
}

function normalizePreferenceStyles(styles: string[] | undefined): string[] {
  return parseStylesQueryParam(styles?.join(",") ?? "");
}

function hasPreferenceSignals(preferences: RecommendationPreferences | null | undefined): boolean {
  return Boolean(
    preferences &&
      ((preferences.styles?.length ?? 0) > 0 ||
        preferences.budget ||
        preferences.group)
  );
}

function mergePreferenceField<T>(
  profileValue: T | undefined,
  urlValue: T | undefined,
  chatValue: T | undefined
): { value: T | undefined; source: AssistantPreferenceSource } {
  if (chatValue !== undefined) {
    return {
      value: chatValue,
      source: urlValue !== undefined || profileValue !== undefined ? "merged" : "chat",
    };
  }
  if (urlValue !== undefined) {
    return {
      value: urlValue,
      source: profileValue !== undefined ? "merged" : "url",
    };
  }
  if (profileValue !== undefined) {
    return { value: profileValue, source: "profile" };
  }
  return { value: undefined, source: "none" };
}

export function resolveAssistantPreferences(input: {
  profilePreferences?: RecommendationPreferences | null;
  urlPreferences?: RecommendationPreferences | null;
  chatPreferences?: RecommendationPreferences | null;
}): AssistantPreferenceResolution {
  const profilePreferences: RecommendationPreferences = {
    ...(input.profilePreferences ?? {}),
  };
  const urlPreferences: RecommendationPreferences = {
    ...(input.urlPreferences ?? {}),
  };
  const chatPreferences: RecommendationPreferences = {
    ...(input.chatPreferences ?? {}),
  };

  const normalizedProfileStyles = normalizePreferenceStyles(profilePreferences.styles);
  const normalizedUrlStyles = normalizePreferenceStyles(urlPreferences.styles);
  const normalizedChatStyles = normalizePreferenceStyles(chatPreferences.styles);

  const stylesResolution = mergePreferenceField(
    normalizedProfileStyles.length > 0 ? normalizedProfileStyles : undefined,
    normalizedUrlStyles.length > 0 ? normalizedUrlStyles : undefined,
    normalizedChatStyles.length > 0 ? normalizedChatStyles : undefined
  );
  const budgetResolution = mergePreferenceField(
    profilePreferences.budget,
    urlPreferences.budget,
    chatPreferences.budget
  );
  const groupResolution = mergePreferenceField(
    profilePreferences.group,
    urlPreferences.group,
    chatPreferences.group
  );

  const resolvedPreferences: RecommendationPreferences = {};
  if (stylesResolution.value && stylesResolution.value.length > 0) {
    resolvedPreferences.styles = stylesResolution.value;
  }
  if (budgetResolution.value) {
    resolvedPreferences.budget = budgetResolution.value;
  }
  if (groupResolution.value) {
    resolvedPreferences.group = groupResolution.value;
  }

  const usedProfile = hasPreferenceSignals(profilePreferences);
  const usedUrl = hasPreferenceSignals(urlPreferences);
  const usedChat = hasPreferenceSignals(chatPreferences);

  const sources = new Set<AssistantPreferenceSource>();
  if (usedProfile) sources.add("profile");
  if (usedUrl) sources.add("url");
  if (usedChat) sources.add("chat");

  const preferenceSource: AssistantPreferenceSource =
    sources.size === 0 ? "none" : sources.size === 1 ? [...sources][0] : "merged";

  return {
    profilePreferences,
    urlPreferences,
    chatPreferences,
    resolvedPreferences,
    preferenceSource,
    usedProfile,
    usedUrl,
    usedChat,
  };
}

/**
 * Feature 20 — genuine travel *decision* questions: the traveller is asking us
 * to choose on their behalf ("what should I do?", "what is best for me?") or
 * to pick between options ("which option is better for me?", "what is a good
 * option?"). Every alternative is deliberately multi-word so a bare keyword
 * such as "best" or "right now" alone never changes an existing intent.
 */
const DECISION_INTENT_PATTERN = new RegExp(
  [
    // "what should I do", "which can we visit", "what should we pick"
    String.raw`\b(?:what|which)\s+(?:should|would|can|could)\s+(?:i|we)\s+(?:do|visit|see|go|explore|pick|choose)\b`,
    // "what is best for me", "which is the right option for us"
    String.raw`\b(?:what|which)\s+(?:is|are|'s)\s+(?:the\s+)?(?:best|right|better|good|ideal)\b[^?!.]*\bfor\s+(?:me|us)\b`,
    // "which option is better", "which one is the best"
    String.raw`\bwhich\s+(?:one|option|place|of\s+these)\s+(?:is|would\s+be)\s+(?:the\s+)?(?:better|best|right|more)\b`,
    // "what is a good option"
    String.raw`\b(?:good|nice|best)\s+option\b`,
    // "what should I do right now", "where should we go tonight"
    String.raw`\b(?:do|visit|see|go|explore)\b[^?!.]*\b(?:right\s+now|tonight|this\s+(?:morning|afternoon|evening))\b`,
  ].join("|")
);

export function inferAssistantIntent(message: string): AssistantIntent {
  const normalized = normalizeMessage(message).toLowerCase();

  if (!normalized) return "unknown";
  if (/\b(compare|vs\.?|versus)\b/.test(normalized)) return "compare";
  if (/\b(why|explain|suitable|fit|fits)\b/.test(normalized)) return "explain";
  if (/\b(shortlist|top\s+places|top\s+options|a few\s+places|some\s+places)\b/.test(normalized)) {
    return "shortlist";
  }
  if (/\b(itinerary|trip|plan|schedule|day plan|trip plan)\b/.test(normalized)) {
    return "trip_focus";
  }
  if (DECISION_INTENT_PATTERN.test(normalized)) return "decision";
  if (/\b(best|recommend|suggest|should we visit|where should we go|what should we visit|which place)\b/.test(normalized)) {
    return "recommend";
  }

  return "clarify";
}

export function normalizeAssistantTurns(
  turns: AssistantTurnInput[] | undefined,
  nowIso: string,
  maxRecentTurns = MAX_RECENT_TURNS
): AssistantTurn[] {
  if (!turns?.length) return [];

  const sliced = turns.slice(-Math.max(0, maxRecentTurns));
  const normalizedTurns: Array<AssistantTurn | null> = sliced.map((turn, index) => {
    const content = normalizeMessage(turn.content);
    if (!content) return null;

    return {
      id: turn.id?.trim() || `turn_${index + 1}`,
      role: turn.role,
      content,
      createdAt: turn.createdAt?.trim() || nowIso,
      intent: turn.intent,
      referencedPlaceIds: turn.referencedPlaceIds?.map((id) => id.trim()).filter(Boolean),
      metadata: turn.metadata
        ? {
            source: turn.metadata.source,
            grounded: turn.metadata.grounded,
            preferenceSource: turn.metadata.preferenceSource,
          }
        : undefined,
    };
  });

  return normalizedTurns.filter((turn): turn is AssistantTurn => turn !== null);
}

export interface BuildTravelContextInput {
  requestId?: string;
  destinationSlug: string;
  destination: DestinationInfo;
  message: string;
  recentTurns?: AssistantTurnInput[];
  selectedPlaceIds?: string[];
  conversationId?: string;
  locale?: string;
  timezone?: string;
  currentPath?: string;
  nowIso?: string;
  preferenceResolution: AssistantPreferenceResolution;
  candidatePlaces: AssistantCandidatePlace[];
  grounding: AssistantGroundingState;
  isAuthenticated?: boolean;
  displayName?: string;
  summary?: string;
  tripId?: string;
  tripPlan?: TripPlan | null;
  tripPlanReport?: TripPlanReport | null;
  weather?: AiWeatherContext | null;
}

export function buildTravelContext(input: BuildTravelContextInput): TravelContext {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const normalizedMessage = normalizeMessage(input.message);
  const intent = inferAssistantIntent(normalizedMessage);
  const recentTurns = normalizeAssistantTurns(input.recentTurns, nowIso);
  const destinationSlug = normalizeDestinationSlug(input.destinationSlug);

  return {
    requestId: input.requestId?.trim() || `req_${nowIso}`,
    destinationSlug,
    destination: input.destination,
    user: {
      isAuthenticated: Boolean(input.isAuthenticated),
      displayName: input.displayName,
      profilePreferences: input.preferenceResolution.profilePreferences,
      urlPreferences: input.preferenceResolution.urlPreferences,
      chatPreferences: input.preferenceResolution.chatPreferences,
      resolvedPreferences: input.preferenceResolution.resolvedPreferences,
      preferenceSource: input.preferenceResolution.preferenceSource,
    },
    conversation: {
      conversationId: input.conversationId,
      turnIndex: recentTurns.length,
      recentTurns,
      summary: input.summary,
    },
    query: {
      message: input.message,
      normalizedMessage,
      intent,
      locale: input.locale,
      timezone: input.timezone,
      currentPath: input.currentPath,
    },
    places: {
      candidatePlaces: input.candidatePlaces,
      selectedPlaceIds: input.grounding.selectedPlaceIds,
      candidateCount: input.candidatePlaces.length,
    },
    grounding: input.grounding,
    trip: input.tripPlan
      ? {
          tripId: input.tripId?.trim() || input.tripPlan.trip.id,
          plan: input.tripPlan,
          report: input.tripPlanReport ?? undefined,
        }
      : undefined,
    weather: input.weather ?? null,
    provenance: {
      retrievedAt: nowIso,
      destinationSource: "place-provider",
      requestSource: "api-route",
    },
  } satisfies TravelContext;
}
