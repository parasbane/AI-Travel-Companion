import type {
  DestinationInfo,
  PlaceCoordinates,
  PriceLevel,
  RecommendationPreferences as PlacesRecommendationPreferences,
  SpecificPlaceCategory,
} from "@/lib/places/types";
import type { TripPlan, TripPlanReport } from "@/lib/saved/types";
import type { ItineraryProposal } from "./itineraryPlanner";
import type { AiWeatherContext } from "./weatherContext";

export type RecommendationPreferences = PlacesRecommendationPreferences;

export type AssistantIntent =
  | "recommend"
  | "compare"
  | "explain"
  | "shortlist"
  | "clarify"
  | "trip_focus"
  | "decision"
  | "unknown";

export type AssistantMessageRole = "user" | "assistant" | "system";
export type AssistantPreferenceSource = "none" | "profile" | "url" | "chat" | "merged";

export interface AssistantTurnMetadata {
  source?: "url" | "profile" | "chat" | "assistant";
  grounded?: boolean;
  preferenceSource?: AssistantPreferenceSource;
}

export interface AssistantTurn {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
  intent?: AssistantIntent;
  referencedPlaceIds?: string[];
  metadata?: AssistantTurnMetadata;
}

export interface AssistantTurnInput {
  id?: string;
  role: AssistantMessageRole;
  content: string;
  createdAt?: string;
  intent?: AssistantIntent;
  referencedPlaceIds?: string[];
  metadata?: Partial<AssistantTurnMetadata>;
}

export interface AssistantPreferenceResolution {
  profilePreferences: RecommendationPreferences;
  urlPreferences: RecommendationPreferences;
  chatPreferences: RecommendationPreferences;
  resolvedPreferences: RecommendationPreferences;
  preferenceSource: AssistantPreferenceSource;
  usedProfile: boolean;
  usedUrl: boolean;
  usedChat: boolean;
}

export interface AssistantCandidatePlace {
  placeId: string;
  slug: string;
  name: string;
  destination: string;
  destinationSlug: string;
  category: SpecificPlaceCategory;
  priceLevel: PriceLevel;
  rating: number;
  reviewCount: number;
  address: string;
  coordinates: PlaceCoordinates;
  shortDescription?: string;
  tags: string[];
  openingHours?: string;
  websiteUrl?: string;
  imageUrl?: string;
  matchScore?: number;
  rankPosition: number;
  source: "place-provider";
}

export interface AssistantGroundingState {
  candidatePlaceIds: string[];
  selectedPlaceIds: string[];
  rejectedPlaceIds: string[];
  usedFallback: boolean;
}

export interface TravelContext {
  requestId: string;
  destinationSlug: string;
  destination: DestinationInfo;
  user: {
    isAuthenticated: boolean;
    displayName?: string;
    profilePreferences: RecommendationPreferences;
    urlPreferences: RecommendationPreferences;
    chatPreferences: RecommendationPreferences;
    resolvedPreferences: RecommendationPreferences;
    preferenceSource: AssistantPreferenceSource;
  };
  conversation: {
    conversationId?: string;
    turnIndex: number;
    recentTurns: AssistantTurn[];
    summary?: string;
  };
  query: {
    message: string;
    normalizedMessage: string;
    intent: AssistantIntent;
    locale?: string;
    timezone?: string;
    currentPath?: string;
  };
  places: {
    candidatePlaces: AssistantCandidatePlace[];
    selectedPlaceIds: string[];
    candidateCount: number;
  };
  grounding: AssistantGroundingState;
  trip?: {
    tripId?: string;
    plan?: TripPlan;
    report?: TripPlanReport;
  };
  provenance: {
    retrievedAt: string;
    destinationSource: "place-provider";
    requestSource: "api-route";
  };
  /** Grounded weather/forecast context, null when unavailable. Never fabricated. */
  weather?: AiWeatherContext | null;
}

export interface AssistantResponseReferencePlace {
  placeId: string;
  slug: string;
  name: string;
  reason: string;
  matchScore?: number;
  coordinates?: PlaceCoordinates;
  category?: SpecificPlaceCategory;
}

export interface AssistantDecisionPlace {
  placeId: string;
  placeName: string;
  /** Deterministic decision-layer score. Not a Gemini-produced value. */
  score: number;
  /** Decision factors exactly as produced by the deterministic decision layer. */
  factors: Array<{ kind: string; label: string }>;
}

/**
 * Feature 20 — the deterministic decision surfaced to the client for
 * "decision" turns. Every value here is copied verbatim from the decision
 * layer (`buildTravelDecision`); the language model only supplies `answer`.
 */
export interface AssistantDecisionSummary {
  /** Place the deterministic layer selected. Never chosen by Gemini. */
  selectedPlaceId?: string;
  selectedPlaceName?: string;
  /** Top ranked grounded places, highest score first. */
  rankedPlaces: AssistantDecisionPlace[];
  /** Deterministic one-line rationale. */
  summary: string;
  /** Mirrors the decision layer's `used*` flags. */
  signalsUsed: {
    preferences: boolean;
    weather: boolean;
    timing: boolean;
    trip: boolean;
    savedPlaces: boolean;
  };
  /** Context that was unavailable, so the UI can stay honest instead of guessing. */
  missingSignals: string[];
}

export interface AssistantResponseEnvelope {
  requestId: string;
  destinationSlug: string;
  conversationId?: string;
  createdAt: string;
  intent: AssistantIntent;
  answer: string;
  assistantTurn: AssistantTurn;
  referencedPlaces: AssistantResponseReferencePlace[];
  primaryPlaceId?: string;
  highlightedPlaceIds: string[];
  mapFocusPlaceId?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
  grounding: {
    candidatePlaceIds: string[];
    selectedPlaceIds: string[];
    referencedPlaceIds: string[];
    rejectedPlaceIds: string[];
    usedFallback: boolean;
  };
  preferenceUsage: {
    usedProfile: boolean;
    usedUrl: boolean;
    usedChat: boolean;
  };
  /**
   * Present only for trip_focus turns where the signed-in user owns a trip and
   * a deterministic plan could be derived from it. This proposal is generated
   * server-side from owned data and can be sent to /api/ai/itinerary/apply.
   */
  itineraryProposal?: ItineraryProposal;

  /**
   * Present only for "decision" turns where the deterministic decision layer
   * produced a result. Copied verbatim from the decision layer so the client
   * can render the chosen place and its reasons without re-deriving anything.
   * The language model contributes only the `answer` prose.
   */
  decisionSummary?: AssistantDecisionSummary;
}

export interface AssistantChatRequest {
  requestId?: string;
  destinationSlug: string;
  userId?: string;
  tripId?: string;
  message: string;
  recentTurns?: AssistantTurnInput[];
  selectedPlaceIds?: string[];
  conversationId?: string;
  urlPreferences?: RecommendationPreferences;
  profilePreferences?: RecommendationPreferences;
  chatPreferences?: RecommendationPreferences;
  locale?: string;
  timezone?: string;
  currentPath?: string;
}

export interface AssistantChatSuccessResponse {
  ok: true;
  data: AssistantResponseEnvelope;
}

export interface AssistantChatErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type AssistantChatApiResponse =
  | AssistantChatSuccessResponse
  | AssistantChatErrorResponse;
