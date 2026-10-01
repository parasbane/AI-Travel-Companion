import { CURATED_DESTINATIONS, generateGenericDestination } from "./curatedData";
import type { DestinationResponse, Place, PlaceFilterParams } from "./types";
import { slugToTitle } from "@/lib/utils/slug";
import { applyRanking } from "./rankingStrategy";
import { hasPersonalizationPrefs } from "./scoring";

export class PlaceProvider {
  /**
   * Retrieves destination details and filtered/sorted places.
   * When preferences are provided and sort is "recommended", places are
   * scored and ordered by deterministic matchScore (0–100).
   */
  public static async getDestinationPlaces(
    slug: string,
    filters: PlaceFilterParams = {}
  ): Promise<DestinationResponse> {
    const normalizedSlug = slug.toLowerCase().trim();

    // 1. Check curated destinations
    let dataset = CURATED_DESTINATIONS[normalizedSlug];

    // 2. If not found in curated, generate a structured placeholder based on the destination title
    if (!dataset) {
      const rawTitle = slugToTitle(normalizedSlug);
      dataset = generateGenericDestination(normalizedSlug, rawTitle);
    }

    let filteredPlaces = [...dataset.places];

    // Category filter
    if (filters.category && filters.category !== "all") {
      filteredPlaces = filteredPlaces.filter((p) => p.category === filters.category);
    }

    // Budget filter
    if (filters.budget && filters.budget !== "all") {
      filteredPlaces = filteredPlaces.filter((p) => p.priceLevel === filters.budget);
    }

    // Keyword search within destination
    if (filters.search && filters.search.trim()) {
      const query = filters.search.trim().toLowerCase();
      filteredPlaces = filteredPlaces.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    // Sorting
    const sort = filters.sort || "recommended";
    if (sort === "rating") {
      filteredPlaces.sort((a, b) => b.rating - a.rating);
    } else if (sort === "reviews") {
      filteredPlaces.sort((a, b) => b.reviewCount - a.reviewCount);
    } else if (sort === "name") {
      filteredPlaces.sort((a, b) => a.name.localeCompare(b.name));
    } else if (
      sort === "recommended" &&
      hasPersonalizationPrefs(filters.preferences)
    ) {
      // Personalized Recommended: score then order by matchScore
      filteredPlaces = applyRanking(filteredPlaces, filters.preferences);
    }
    // else "recommended" without prefs preserves balanced editorial curation

    return {
      destination: {
        ...dataset.info,
        totalPlaces: dataset.places.length,
      },
      places: filteredPlaces,
      totalCount: filteredPlaces.length,
      appliedCategory: filters.category || "all",
    };
  }

  /**
   * Retrieves an individual place by its ID or slug.
   */
  public static async getPlaceById(
    destinationSlug: string,
    placeId: string
  ): Promise<Place | null> {
    const response = await this.getDestinationPlaces(destinationSlug);
    return response.places.find((p) => p.id === placeId || p.slug === placeId) || null;
  }
}
