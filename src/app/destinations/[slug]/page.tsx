import type { Metadata } from "next";
import { PlaceProvider } from "@/lib/places/provider";
import { slugToTitle } from "@/lib/utils/slug";
import DestinationHero from "@/components/destinations/DestinationHero";
import DestinationContext from "@/components/destinations/DestinationContext";
import DestinationWeather from "@/components/destinations/DestinationWeather";
import WeatherMatchedPicks from "@/components/destinations/WeatherMatchedPicks";
import { getDestinationContext } from "@/lib/destinations/destinationContext";
import PlaceGrid from "@/components/destinations/PlaceGrid";
import type { PlaceCategory } from "@/lib/places/types";
import {
  hasSessionPersonalizationPrefs,
  parsePersonalizationSearchParams,
  sessionToRecommendationPreferences,
} from "@/lib/places/preferenceParams";

interface DestinationPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
  params,
}: DestinationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = slugToTitle(slug);

  return {
    title: `${title} Highlights & Places to Visit — AI Travel Companion`,
    description: `Discover verified landmarks, culinary spots, nature walks, and cultural gems in ${title}.`,
  };
}

export default async function DestinationPage({
  params,
  searchParams,
}: DestinationPageProps) {
  const { slug } = await params;
  const sParams = await searchParams;

  const rawCategory = sParams.category;
  const initialCategory: PlaceCategory =
    typeof rawCategory === "string" ? (rawCategory as PlaceCategory) : "all";

  const initialSessionPrefs = parsePersonalizationSearchParams(sParams);
  const sessionPrefsActive = hasSessionPersonalizationPrefs(initialSessionPrefs);

  // Server-side prefetch (editorial order, or personalized when URL prefs exist).
  // PlaceGrid remains the interactive source of truth and merges profile prefs.
  const data = await PlaceProvider.getDestinationPlaces(slug, {
    category: "all",
    ...(sessionPrefsActive
      ? {
          preferences: sessionToRecommendationPreferences(initialSessionPrefs),
          sort: "recommended" as const,
        }
      : {}),
  });

  const ctx = getDestinationContext(slug);

  return (
    <div className="flex flex-col w-full min-h-screen bg-zinc-50/50 dark:bg-zinc-950/50">
      <DestinationHero destination={data.destination} />

      <DestinationContext context={ctx} />

      <DestinationWeather
        destinationSlug={slug}
        destinationName={data.destination.name}
      />

      <WeatherMatchedPicks destinationSlug={slug} places={data.places} />

      <PlaceGrid
        initialPlaces={data.places}
        destinationSlug={slug}
        initialCategory={initialCategory}
        initialSessionPrefs={initialSessionPrefs}
        mapFallbackCenter={data.destination.coordinates}
      />
    </div>
  );
}
