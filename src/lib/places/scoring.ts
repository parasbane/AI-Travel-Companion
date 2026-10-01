import type {
  BudgetPreference,
  Place,
  PriceLevel,
  RecommendationPreferences,
  TravelGroupPreference,
} from "./types";

export type { RecommendationPreferences };

/** Max points per scoring component (sum = 100 when all are active). */
export const SCORE_WEIGHTS = {
  style: 45,
  budget: 25,
  group: 20,
  quality: 10,
} as const;

const STYLE_IDS = new Set([
  "culture",
  "nature",
  "food",
  "adventure",
  "relaxation",
  "nightlife",
  /** Landmarks interest — matches place category `attractions`. */
  "attractions",
]);

/** Accept common aliases so landing/URL labels map into STYLE_IDS. */
const STYLE_ALIASES: Record<string, string> = {
  landmarks: "attractions",
};

/** Preferred / soft / mismatch price levels by user budget preference. */
const BUDGET_AFFINITY: Record<
  BudgetPreference,
  { strong: PriceLevel[]; soft: PriceLevel[]; mismatch: PriceLevel[] }
> = {
  budget: {
    strong: ["free", "budget"],
    soft: ["moderate"],
    mismatch: ["expensive"],
  },
  balanced: {
    strong: ["budget", "moderate"],
    soft: ["free", "expensive"],
    mismatch: [],
  },
  luxury: {
    strong: ["moderate", "expensive"],
    soft: ["budget"],
    mismatch: ["free"],
  },
};

type GroupHeuristic = {
  boostCategories: string[];
  penalizeCategories: string[];
  boostTagKeywords: string[];
  preferPriceLevels?: PriceLevel[];
};

const GROUP_HEURISTICS: Record<TravelGroupPreference, GroupHeuristic> = {
  solo: {
    boostCategories: ["adventure", "culture"],
    penalizeCategories: [],
    boostTagKeywords: ["hiking", "trek", "solo", "free", "independent"],
    preferPriceLevels: ["free", "budget"],
  },
  couple: {
    boostCategories: ["food", "relaxation", "nightlife"],
    penalizeCategories: [],
    boostTagKeywords: [
      "romantic",
      "sunset",
      "dining",
      "wine",
      "cocktails",
      "spa",
      "wellness",
    ],
  },
  family: {
    boostCategories: ["nature", "attractions"],
    penalizeCategories: ["nightlife"],
    boostTagKeywords: ["family", "picnic", "garden", "park", "kid", "kids"],
    preferPriceLevels: ["free", "budget"],
  },
  friends: {
    boostCategories: ["nightlife", "adventure", "food"],
    penalizeCategories: [],
    boostTagKeywords: ["nightlife", "party", "group", "club", "live music"],
  },
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeStyles(styles: string[] | undefined): string[] {
  if (!styles?.length) return [];
  return [
    ...new Set(
      styles
        .map(normalizeToken)
        .map((s) => STYLE_ALIASES[s] ?? s)
        .filter((s) => s.length > 0 && STYLE_IDS.has(s))
    ),
  ];
}

/** True when at least one preference signal is present for personalization. */
export function hasPersonalizationPrefs(
  prefs: RecommendationPreferences | null | undefined
): boolean {
  if (!prefs) return false;
  if (normalizeStyles(prefs.styles).length > 0) return true;
  if (prefs.budget) return true;
  if (prefs.group) return true;
  return false;
}

/**
 * Parse comma-separated styles from a landing-page `?styles=` query value.
 */
export function parseStylesQueryParam(
  raw: string | string[] | undefined | null
): string[] {
  if (raw == null) return [];
  const value = Array.isArray(raw) ? raw.join(",") : raw;
  return normalizeStyles(value.split(","));
}

/**
 * Merge session (URL / panel) preferences with a saved profile.
 * Non-empty URL styles win over profile styles.
 * Explicit URL budget/group win over the corresponding profile fields.
 * When a URL field is absent, the profile value is used as fallback.
 */
export function resolveRecommendationPreferences(input: {
  urlStyles?: string[];
  urlBudget?: BudgetPreference;
  urlGroup?: TravelGroupPreference;
  profileStyles?: string[];
  budget?: BudgetPreference;
  group?: TravelGroupPreference;
}): RecommendationPreferences {
  const fromUrl = normalizeStyles(input.urlStyles);
  const fromProfile = normalizeStyles(input.profileStyles);
  const styles = fromUrl.length > 0 ? fromUrl : fromProfile;
  const budget = input.urlBudget ?? input.budget;
  const group = input.urlGroup ?? input.group;

  const prefs: RecommendationPreferences = {};
  if (styles.length > 0) prefs.styles = styles;
  if (budget) prefs.budget = budget;
  if (group) prefs.group = group;
  return prefs;
}

function scoreStyle(place: Place, styles: string[]): number {
  if (styles.length === 0) return 0;
  const max = SCORE_WEIGHTS.style;

  if (styles.includes(place.category)) {
    return max;
  }

  const tagTokens = place.tags.map(normalizeToken);
  const tagHit = styles.some(
    (style) =>
      tagTokens.some(
        (tag) => tag === style || tag.includes(style) || style.includes(tag)
      )
  );

  return tagHit ? Math.round(max * 0.5) : 0;
}

function scoreBudget(place: Place, budget: BudgetPreference): number {
  const max = SCORE_WEIGHTS.budget;
  const affinity = BUDGET_AFFINITY[budget];
  if (affinity.strong.includes(place.priceLevel)) return max;
  if (affinity.soft.includes(place.priceLevel)) return Math.round(max * 0.5);
  if (affinity.mismatch.includes(place.priceLevel)) return Math.round(max * 0.15);
  return Math.round(max * 0.35);
}

function scoreGroup(place: Place, group: TravelGroupPreference): number {
  const max = SCORE_WEIGHTS.group;
  const heuristic = GROUP_HEURISTICS[group];
  let points = Math.round(max * 0.35); // neutral baseline

  if (heuristic.boostCategories.includes(place.category)) {
    points = max;
  } else if (heuristic.penalizeCategories.includes(place.category)) {
    points = Math.round(max * 0.15);
  }

  const tagBlob = place.tags.map(normalizeToken).join(" ");
  const tagBoost = heuristic.boostTagKeywords.some((kw) =>
    tagBlob.includes(normalizeToken(kw))
  );
  if (tagBoost) {
    points = Math.min(max, points + Math.round(max * 0.25));
  }

  if (
    heuristic.preferPriceLevels?.includes(place.priceLevel) &&
    points < max
  ) {
    points = Math.min(max, points + Math.round(max * 0.1));
  }

  return Math.min(max, points);
}

function scoreQuality(place: Place): number {
  const max = SCORE_WEIGHTS.quality;
  const clamped = Math.min(5, Math.max(0, place.rating));
  return Math.round((clamped / 5) * max);
}

/**
 * Compute a 0–100 match score for a single place.
 * Returns undefined when no personalization preferences are provided.
 */
export function scorePlace(
  place: Place,
  prefs: RecommendationPreferences | null | undefined
): number | undefined {
  if (!hasPersonalizationPrefs(prefs)) return undefined;

  const styles = normalizeStyles(prefs!.styles);
  const useStyle = styles.length > 0;
  const useBudget = Boolean(prefs!.budget);
  const useGroup = Boolean(prefs!.group);

  let earned = 0;
  let possible = 0;

  // Quality is always a small tie-breaker when personalizing.
  earned += scoreQuality(place);
  possible += SCORE_WEIGHTS.quality;

  if (useStyle) {
    earned += scoreStyle(place, styles);
    possible += SCORE_WEIGHTS.style;
  }
  if (useBudget) {
    earned += scoreBudget(place, prefs!.budget!);
    possible += SCORE_WEIGHTS.budget;
  }
  if (useGroup) {
    earned += scoreGroup(place, prefs!.group!);
    possible += SCORE_WEIGHTS.group;
  }

  if (possible === 0) return undefined;

  return Math.round((earned / possible) * 100);
}

/**
 * Attach matchScore and return a new array sorted by score (desc).
 * Preserves original relative order on ties.
 * When prefs are empty, returns places unchanged (no matchScore mutation).
 */
export function rankPlaces(
  places: Place[],
  prefs: RecommendationPreferences | null | undefined
): Place[] {
  if (!hasPersonalizationPrefs(prefs)) {
    return places;
  }

  const indexed = places.map((place, index) => ({
    place: {
      ...place,
      matchScore: scorePlace(place, prefs),
    },
    index,
  }));

  indexed.sort((a, b) => {
    const scoreA = a.place.matchScore ?? 0;
    const scoreB = b.place.matchScore ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.index - b.index;
  });

  return indexed.map((entry) => entry.place);
}
