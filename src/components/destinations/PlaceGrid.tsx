"use client";

import React, { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  Place,
  PlaceCategory,
  PlaceCoordinates,
  PriceLevel,
} from "@/lib/places/types";
import CategoryTabs from "./CategoryTabs";
import FilterToolbar from "./FilterToolbar";
import PlaceCard from "./PlaceCard";
import PlaceCardSkeleton from "./PlaceCardSkeleton";
import PlaceDetailsModal from "./PlaceDetailsModal";
import DestinationMapSection from "./DestinationMapSection";
import type { MapFocusRequest } from "./DestinationMap";
import PersonalizePreferencesPanel, {
  type PersonalizeDraft,
} from "./PersonalizePreferencesPanel";
import { useAuth } from "@/context/AuthContext";
import {
  hasPersonalizationPrefs,
  resolveRecommendationPreferences,
} from "@/lib/places/scoring";
import { applyRanking } from "@/lib/places/rankingStrategy";
import type { RecommendationPreferences } from "@/lib/places/types";
import {
  applyPersonalizationToSearchParams,
  hasSessionPersonalizationPrefs,
  type SessionPersonalizationParams,
} from "@/lib/places/preferenceParams";
import TravelAssistantChat from "@/components/ai/TravelAssistantChat";

interface PlaceGridProps {
  initialPlaces: Place[];
  destinationSlug: string;
  initialCategory?: PlaceCategory;
  /** Session prefs from URL (`styles`, `group`, `budgetPreference`, `trip`). */
  initialSessionPrefs?: SessionPersonalizationParams;
  /** Destination center used when place coordinates are sparse. */
  mapFallbackCenter?: PlaceCoordinates | null;
  isLoading?: boolean;
}

const EMPTY_SESSION: SessionPersonalizationParams = { styles: [] };

export default function PlaceGrid({
  initialPlaces,
  destinationSlug,
  initialCategory = "all",
  initialSessionPrefs = EMPTY_SESSION,
  mapFallbackCenter = null,
  isLoading = false,
}: PlaceGridProps) {
  const { profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory>(initialCategory);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBudget, setSelectedBudget] = useState<PriceLevel | "all">("all");
  const [selectedSort, setSelectedSort] = useState<"recommended" | "rating" | "reviews" | "name">("recommended");
  const [activePlace, setActivePlace] = useState<Place | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mapFocusRequest, setMapFocusRequest] = useState<MapFocusRequest | null>(null);
  const [sessionPrefs, setSessionPrefs] =
    useState<SessionPersonalizationParams>(initialSessionPrefs);
  const [panelOpen, setPanelOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const syncSessionToUrl = useCallback(
    (next: SessionPersonalizationParams) => {
      const params = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      applyPersonalizationToSearchParams(params, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router]
  );

  const preferences: RecommendationPreferences = useMemo(
    () =>
      resolveRecommendationPreferences({
        urlStyles: sessionPrefs.styles,
        urlBudget: sessionPrefs.budget,
        urlGroup: sessionPrefs.group,
        profileStyles: profile?.travel_styles,
        budget: profile?.budget_preference,
        group: profile?.travel_group_preference,
      }),
    [
      sessionPrefs.styles,
      sessionPrefs.budget,
      sessionPrefs.group,
      profile?.travel_styles,
      profile?.budget_preference,
      profile?.travel_group_preference,
    ]
  );

  const personalizationActive = hasPersonalizationPrefs(preferences);
  const sessionActive = hasSessionPersonalizationPrefs(sessionPrefs);
  const personalizeSource: "session" | "profile" | null = personalizationActive
    ? sessionActive
      ? "session"
      : profile
        ? "profile"
        : null
    : null;

  const panelDraft: PersonalizeDraft = useMemo(() => {
    if (sessionActive) {
      return {
        styles: sessionPrefs.styles,
        budget: sessionPrefs.budget,
        group: sessionPrefs.group,
        trip: sessionPrefs.trip,
      };
    }
    return {
      styles: preferences.styles ?? [],
      budget: preferences.budget,
      group: preferences.group,
      trip: sessionPrefs.trip,
    };
  }, [sessionActive, sessionPrefs, preferences]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: initialPlaces.length };
    initialPlaces.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [initialPlaces]);

  // Same filtered list drives cards and map markers.
  // Sort/personalization reorder only — they never remove places.
  const filteredPlaces = useMemo(() => {
    let result = [...initialPlaces];

    if (selectedCategory !== "all") {
      result = result.filter((p) => p.category === selectedCategory);
    }

    if (selectedBudget !== "all") {
      result = result.filter((p) => p.priceLevel === selectedBudget);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (selectedSort === "rating") {
      result.sort((a, b) => b.rating - a.rating);
    } else if (selectedSort === "reviews") {
      result.sort((a, b) => b.reviewCount - a.reviewCount);
    } else if (selectedSort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      result = applyRanking(result, preferences);
    }

    return result;
  }, [
    initialPlaces,
    selectedCategory,
    selectedBudget,
    searchQuery,
    selectedSort,
    preferences,
  ]);

  // Drop stale selection when filters remove the place (derived — no sync effect).
  const activeSelectedPlaceId = useMemo(() => {
    if (!selectedPlaceId) return null;
    return filteredPlaces.some((place) => place.id === selectedPlaceId)
      ? selectedPlaceId
      : null;
  }, [filteredPlaces, selectedPlaceId]);

  const handleResetFilters = () => {
    setSelectedCategory("all");
    setSearchQuery("");
    setSelectedBudget("all");
    setSelectedSort("recommended");
  };

  const handleApplyPersonalize = (draft: PersonalizeDraft) => {
    const next: SessionPersonalizationParams = {
      styles: draft.styles,
      budget: draft.budget,
      group: draft.group,
      trip: draft.trip,
    };
    setSessionPrefs(next);
    syncSessionToUrl(next);
    setStatusMessage("Recommendations updated");
  };

  const handleClearPersonalize = () => {
    setSessionPrefs(EMPTY_SESSION);
    syncSessionToUrl(EMPTY_SESSION);
    setStatusMessage(
      profile
        ? "Session preferences cleared — using profile preferences"
        : "Personalization cleared"
    );
  };

  const handleCardClick = (place: Place) => {
    setSelectedPlaceId(place.id);
    setMapFocusRequest({ placeId: place.id, nonce: Date.now() });
    setActivePlace(place);
  };

  const handleMapSelect = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setStatusMessage(
      `Selected ${filteredPlaces.find((p) => p.id === placeId)?.name ?? "place"} on the map`
    );
  };

  const handleViewDetails = (place: Place) => {
    setSelectedPlaceId(place.id);
    setActivePlace(place);
  };

  const handleAssistantFocusPlace = (placeId: string) => {
    const place = filteredPlaces.find((item) => item.id === placeId);
    if (!place) return;
    setSelectedPlaceId(place.id);
    setMapFocusRequest({ placeId: place.id, nonce: Date.now() });
    setActivePlace(place);
  };

  const profilePreferences = profile
    ? {
        styles: profile.travel_styles,
        budget: profile.budget_preference,
        group: profile.travel_group_preference,
      }
    : undefined;

  const urlPreferences = {
    styles: sessionPrefs.styles,
    budget: sessionPrefs.budget,
    group: sessionPrefs.group,
  };

  return (
    <div className="w-full">
      <CategoryTabs
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        categoryCounts={categoryCounts}
      />

      <FilterToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedBudget={selectedBudget}
        onBudgetChange={setSelectedBudget}
        selectedSort={selectedSort}
        onSortChange={setSelectedSort}
        totalResults={filteredPlaces.length}
        onReset={handleResetFilters}
        personalizeActive={personalizationActive}
        personalizeSource={personalizeSource}
        onOpenPersonalize={() => setPanelOpen(true)}
        onClearSessionPersonalize={
          sessionActive ? handleClearPersonalize : undefined
        }
      />

      <TravelAssistantChat
        destinationSlug={destinationSlug}
        destinationName={initialPlaces[0]?.destination ?? destinationSlug}
        preferenceContext={{
          profilePreferences,
          urlPreferences,
          resolvedPreferences: preferences,
        }}
        selectedPlaceIds={activeSelectedPlaceId ? [activeSelectedPlaceId] : []}
        onFocusPlace={handleAssistantFocusPlace}
      />

      <div className="sr-only" aria-live="polite">
        {statusMessage}
      </div>

      {!isLoading && (
        <DestinationMapSection
          places={filteredPlaces}
          selectedPlaceId={activeSelectedPlaceId}
          focusRequest={mapFocusRequest}
          fallbackCenter={mapFallbackCenter}
          onSelectPlace={handleMapSelect}
          onViewDetails={handleViewDetails}
          onClearSelection={() => setSelectedPlaceId(null)}
        />
      )}

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <PlaceCardSkeleton key={idx} />
            ))}
          </div>
        ) : filteredPlaces.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSelected={place.id === activeSelectedPlaceId}
                onClick={handleCardClick}
              />
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900 my-12 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl text-zinc-500 dark:bg-zinc-800">
              🔍
            </div>
            <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
              No highlights match your filters
            </h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Try adjusting your category, removing the search query, or switching price tiers to discover more spots.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      <PlaceDetailsModal
        place={activePlace}
        onClose={() => setActivePlace(null)}
      />

      {panelOpen && (
        <PersonalizePreferencesPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          initialDraft={panelDraft}
          onApply={handleApplyPersonalize}
          onClear={handleClearPersonalize}
        />
      )}
    </div>
  );
}
