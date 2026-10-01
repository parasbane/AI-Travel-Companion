import { NextResponse } from "next/server";
import { PlaceProvider } from "@/lib/places/provider";
import type {
  BudgetPreference,
  PlaceCategory,
  PriceLevel,
  RecommendationPreferences,
  TravelGroupPreference,
} from "@/lib/places/types";
import { parseStylesQueryParam } from "@/lib/places/scoring";

const BUDGET_PREFS = new Set<BudgetPreference>(["budget", "balanced", "luxury"]);
const GROUP_PREFS = new Set<TravelGroupPreference>([
  "solo",
  "couple",
  "family",
  "friends",
]);

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;

    if (!slug) {
      return NextResponse.json(
        { error: "Destination slug is required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = (searchParams.get("category") as PlaceCategory) || "all";
    const budget = (searchParams.get("budget") as PriceLevel | "all") || "all";
    const sort =
      (searchParams.get("sort") as "recommended" | "rating" | "reviews" | "name") ||
      "recommended";
    const search = searchParams.get("search") || undefined;

    const styles = parseStylesQueryParam(searchParams.get("styles"));
    const budgetPreferenceRaw = searchParams.get("budgetPreference");
    const groupRaw = searchParams.get("group");

    const preferences: RecommendationPreferences = {};
    if (styles.length > 0) preferences.styles = styles;
    if (
      budgetPreferenceRaw &&
      BUDGET_PREFS.has(budgetPreferenceRaw as BudgetPreference)
    ) {
      preferences.budget = budgetPreferenceRaw as BudgetPreference;
    }
    if (groupRaw && GROUP_PREFS.has(groupRaw as TravelGroupPreference)) {
      preferences.group = groupRaw as TravelGroupPreference;
    }

    const hasPrefs = Boolean(
      preferences.styles?.length || preferences.budget || preferences.group
    );

    const data = await PlaceProvider.getDestinationPlaces(slug, {
      category,
      budget,
      sort,
      search,
      preferences: hasPrefs ? preferences : undefined,
    });

    const headers: HeadersInit = hasPrefs
      ? {
          // Personalized responses must not be shared across users/CDN caches
          "Cache-Control": "private, no-store",
        }
      : {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        };

    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error("Error fetching destination places:", error);
    return NextResponse.json(
      { error: "Failed to retrieve places for destination" },
      { status: 500 }
    );
  }
}
