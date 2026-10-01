import type { Place } from "@/lib/places/types";
import type {
  AssistantCandidatePlace,
  AssistantGroundingState,
} from "./types";

export const MAX_GROUNDED_CANDIDATES = 6;

export interface GroundCandidatePlacesInput {
  places: Place[];
  selectedPlaceIds?: string[];
  maxCandidates?: number;
}

export interface GroundedPlaceReferenceValidation {
  validPlaceIds: string[];
  rejectedPlaceIds: string[];
  isValid: boolean;
}

function normalizePlaceIdList(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function toAssistantCandidatePlace(place: Place, rankPosition: number): AssistantCandidatePlace {
  return {
    placeId: place.id,
    slug: place.slug,
    name: place.name,
    destination: place.destination,
    destinationSlug: place.destinationSlug,
    category: place.category,
    priceLevel: place.priceLevel,
    rating: place.rating,
    reviewCount: place.reviewCount,
    address: place.address,
    coordinates: place.coordinates,
    shortDescription: place.shortDescription,
    tags: [...place.tags],
    openingHours: place.openingHours,
    websiteUrl: place.websiteUrl,
    imageUrl: place.imageUrl,
    matchScore: place.matchScore,
    rankPosition,
    source: "place-provider",
  };
}

export function groundCandidatePlaces({
  places,
  selectedPlaceIds,
  maxCandidates = MAX_GROUNDED_CANDIDATES,
}: GroundCandidatePlacesInput): {
  candidatePlaces: AssistantCandidatePlace[];
  selectedPlaceIds: string[];
  rejectedPlaceIds: string[];
  candidatePlaceIds: string[];
  usedFallback: boolean;
  grounding: AssistantGroundingState;
} {
  const boundedPlaces = places.slice(0, Math.max(0, maxCandidates));
  const candidatePlaces = boundedPlaces.map((place, index) =>
    toAssistantCandidatePlace(place, index + 1)
  );
  const candidatePlaceIds = candidatePlaces.map((place) => place.placeId);
  const requestedSelectedPlaceIds = normalizePlaceIdList(selectedPlaceIds);

  const selected = requestedSelectedPlaceIds.filter((placeId) =>
    candidatePlaceIds.includes(placeId)
  );
  const rejected = requestedSelectedPlaceIds.filter(
    (placeId) => !candidatePlaceIds.includes(placeId)
  );

  const usedFallback = candidatePlaces.length === 0;

  return {
    candidatePlaces,
    selectedPlaceIds: selected,
    rejectedPlaceIds: rejected,
    candidatePlaceIds,
    usedFallback,
    grounding: {
      candidatePlaceIds,
      selectedPlaceIds: selected,
      rejectedPlaceIds: rejected,
      usedFallback,
    },
  };
}

export function validateGroundedPlaceReferences(
  candidatePlaceIds: string[],
  referencedPlaceIds: string[]
): GroundedPlaceReferenceValidation {
  const normalizedReferences = normalizePlaceIdList(referencedPlaceIds);
  const validPlaceIds = normalizedReferences.filter((placeId) =>
    candidatePlaceIds.includes(placeId)
  );
  const rejectedPlaceIds = normalizedReferences.filter(
    (placeId) => !candidatePlaceIds.includes(placeId)
  );

  return {
    validPlaceIds,
    rejectedPlaceIds,
    isValid: rejectedPlaceIds.length === 0,
  };
}
