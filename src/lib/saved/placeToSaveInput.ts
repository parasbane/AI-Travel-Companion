import type { Place } from "@/lib/places/types";
import type { SavePlaceInput } from "./types";

export function buildSavePlaceInput(place: Place): SavePlaceInput {
  return {
    placeId: place.id,
    destinationSlug: place.destinationSlug,
    placeName: place.name,
    placeCategory: place.category,
    placeImageUrl: place.imageUrl,
    placeRating: place.rating,
    placePriceLevel: place.priceLevel,
    placeAddress: place.address,
  };
}