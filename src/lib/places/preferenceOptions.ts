import type { BudgetPreference, TravelGroupPreference } from "./types";

/** Soft trip/time preference — URL/UI only; not used by scoring. */
export type TripPreference = "flexible" | "weekend" | "longer";

export interface PreferenceOption<T extends string = string> {
  id: T;
  label: string;
  description?: string;
}

export const TRAVEL_GROUP_OPTIONS: PreferenceOption<TravelGroupPreference>[] = [
  { id: "solo", label: "Solo" },
  { id: "couple", label: "Couple" },
  { id: "friends", label: "Friends" },
  { id: "family", label: "Family" },
];

/** Product labels; stored values match BudgetPreference. */
export const BUDGET_PREFERENCE_OPTIONS: PreferenceOption<BudgetPreference>[] = [
  {
    id: "budget",
    label: "Budget",
    description: "Value-focused picks",
  },
  {
    id: "balanced",
    label: "Moderate",
    description: "Balanced mid-range",
  },
  {
    id: "luxury",
    label: "Premium",
    description: "Higher-end experiences",
  },
];

/**
 * Interest chips for personalization.
 * Ids must stay aligned with STYLE_IDS / place categories in scoring.
 */
export const INTEREST_OPTIONS: PreferenceOption[] = [
  { id: "culture", label: "Culture" },
  { id: "nature", label: "Nature" },
  { id: "food", label: "Food & Dining" },
  { id: "adventure", label: "Adventure" },
  { id: "relaxation", label: "Relaxation" },
  { id: "nightlife", label: "Nightlife" },
  { id: "attractions", label: "Landmarks" },
];

export const TRIP_PREFERENCE_OPTIONS: PreferenceOption<TripPreference>[] = [
  { id: "flexible", label: "Flexible" },
  { id: "weekend", label: "Weekend" },
  { id: "longer", label: "Longer stay" },
];

export const BUDGET_PREFERENCE_IDS = new Set<BudgetPreference>(
  BUDGET_PREFERENCE_OPTIONS.map((o) => o.id)
);

export const TRAVEL_GROUP_IDS = new Set<TravelGroupPreference>(
  TRAVEL_GROUP_OPTIONS.map((o) => o.id)
);

export const TRIP_PREFERENCE_IDS = new Set<TripPreference>(
  TRIP_PREFERENCE_OPTIONS.map((o) => o.id)
);
