export type PlaceCategory =
  | "all"
  | "culture"
  | "food"
  | "nature"
  | "adventure"
  | "relaxation"
  | "nightlife"
  | "attractions";

export type SpecificPlaceCategory = Exclude<PlaceCategory, "all">;

export type PriceLevel = "free" | "budget" | "moderate" | "expensive";

export type BudgetPreference = "budget" | "balanced" | "luxury";
export type TravelGroupPreference = "solo" | "couple" | "family" | "friends";

/**
 * User preference inputs for deterministic place ranking.
 * Kept here (not in scoring) to avoid circular imports with Place types.
 */
export interface RecommendationPreferences {
  styles?: string[];
  budget?: BudgetPreference;
  group?: TravelGroupPreference;
}

export interface PlaceCoordinates {
  latitude: number;
  longitude: number;
}

export interface Place {
  id: string;
  slug: string;
  name: string;
  destination: string;
  destinationSlug: string;
  category: SpecificPlaceCategory;
  description: string;
  shortDescription?: string;
  rating: number;
  reviewCount: number;
  priceLevel: PriceLevel;
  address: string;
  coordinates: PlaceCoordinates;
  imageUrl: string;
  tags: string[];
  websiteUrl?: string;
  openingHours?: string;
  isSaved?: boolean;
  matchScore?: number;
}

export interface DestinationInfo {
  slug: string;
  name: string;
  country: string;
  description: string;
  bestTimeToVisit: string;
  coordinates: PlaceCoordinates;
  heroImageUrl: string;
  popularCategories: SpecificPlaceCategory[];
  totalPlaces: number;
}

export interface PlaceFilterParams {
  category?: PlaceCategory;
  budget?: PriceLevel | "all";
  sort?: "recommended" | "rating" | "reviews" | "name";
  search?: string;
  /** Optional personalization inputs (Recommended sort only). */
  preferences?: RecommendationPreferences;
}

export interface DestinationResponse {
  destination: DestinationInfo;
  places: Place[];
  totalCount: number;
  appliedCategory: PlaceCategory;
}
