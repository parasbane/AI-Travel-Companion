import type { Place, RecommendationPreferences } from "./types";
import { hasPersonalizationPrefs, rankPlaces } from "./scoring";

/**
 * Pluggable ranking strategies. Deterministic v1 today; LLM later.
 */
export interface RankingStrategy {
  readonly id: string;
  rank(places: Place[], prefs: RecommendationPreferences): Place[];
}

/**
 * Pure preference-weighted ranking (0–100 matchScore).
 */
export class DeterministicRankingStrategy implements RankingStrategy {
  readonly id = "deterministic";

  rank(places: Place[], prefs: RecommendationPreferences): Place[] {
    return rankPlaces(places, prefs);
  }
}

export type RankingStrategyKind = "deterministic";

let defaultStrategy: RankingStrategy = new DeterministicRankingStrategy();

/**
 * Factory for ranking strategies. Extend with `"llm"` when an LLM layer ships.
 */
export function createRankingStrategy(
  kind: RankingStrategyKind = "deterministic"
): RankingStrategy {
  switch (kind) {
    case "deterministic":
      return new DeterministicRankingStrategy();
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function getDefaultRankingStrategy(): RankingStrategy {
  return defaultStrategy;
}

/** Test / future DI hook — swap in an LLM strategy without touching callers. */
export function setDefaultRankingStrategy(strategy: RankingStrategy): void {
  defaultStrategy = strategy;
}

/**
 * Apply personalization when prefs exist; otherwise return places as-is.
 */
export function applyRanking(
  places: Place[],
  prefs: RecommendationPreferences | null | undefined,
  strategy: RankingStrategy = getDefaultRankingStrategy()
): Place[] {
  if (!hasPersonalizationPrefs(prefs)) {
    return places;
  }
  return strategy.rank(places, prefs ?? {});
}
