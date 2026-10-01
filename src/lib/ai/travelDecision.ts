import { hasPersonalizationPrefs } from "@/lib/places/scoring";
import type { WeatherMatchCause, WeatherMatchLean } from "@/lib/weather/weatherMatches";
import { classifyForecastDay } from "@/lib/weather/weatherMatches";
import { forecastDayForDate } from "./weatherContext";
import type { AiWeatherContext, AiWeatherForecastDay } from "./weatherContext";
import type {
  AssistantCandidatePlace,
  AssistantDecisionSummary,
  RecommendationPreferences,
} from "./types";

/**
 * Feature 20 — Real-Time Travel Decision Intelligence.
 *
 * A pure, deterministic decision layer. It combines only grounded, real-world
 * signals — existing per-place match scores/ratings/categories, travel
 * preferences, the traveller's own itinerary, and forecast weather — into a
 * single stable ranking. It never fetches data, never touches the browser,
 * never calls an LLM, and never fabricates facts: when a signal is unavailable
 * it is simply not used and is reported as missing. The ranking is the source
 * of truth; the AI layer only explains it.
 */

export type DecisionFactorKind =
  | "style"
  | "budget"
  | "group"
  | "quality"
  | "weather"
  | "itinerary"
  | "timing";

export interface DecisionFactor {
  kind: DecisionFactorKind;
  /** Short deterministic label shown to the traveller, e.g. "Fits your budget". */
  label: string;
}

export type DecisionMissingSignal = "weather" | "timing" | "trip" | "preferences";

export interface DecisionTimingRequest {
  /** true when the message named a specific day (today/tomorrow/tonight/weekday). */
  dateNamed: boolean;
  /** Resolved calendar date "YYYY-MM-DD" when a named day could be computed. */
  requestedDate?: string;
  /** Part-of-day phrase when the message mentioned one. */
  partOfDay?: "morning" | "afternoon" | "evening" | "night";
}

export interface TravelDecisionInput {
  destinationSlug: string;
  destinationName?: string;
  candidatePlaces: AssistantCandidatePlace[];
  preferences?: RecommendationPreferences;
  weather?: AiWeatherContext | null;
  scheduledPlaceIds?: string[];
  timing?: DecisionTimingRequest;
  restrictToPlaceIds?: string[];
  nowIso?: string;
}

export interface PlaceDecision {
  placeId: string;
  score: number;
  factors: DecisionFactor[];
}

export interface TravelDecisionResult {
  destinationSlug: string;
  destinationName?: string;
  rankedPlaces: PlaceDecision[];
  primary: PlaceDecision | null;
  usedPreferences: boolean;
  usedWeather: boolean;
  weatherFitPlaceIds: string[];
  usedTiming: boolean;
  timing?: DecisionTimingRequest;
  usedTrip: boolean;
  scheduledPlaceIds: string[];
  usedSavedPlaces: boolean;
  missingSignals: DecisionMissingSignal[];
  /** Deterministic, grounded one-line summary of the decision. */
  summary: string;
}

/** Identical membership semantics to F18's weather-matched-category sets. */
const INDOOR_CATEGORIES: ReadonlySet<string> = new Set([
  "culture",
  "food",
  "attractions",
  "relaxation",
]);
const OUTDOOR_CATEGORIES: ReadonlySet<string> = new Set(["nature", "adventure"]);

const WEATHER_MATCH_BONUS = 8;
const WEATHER_OPPOSE_PENALTY = -8;
const ITINERARY_BOOST = 6;
const QUALITY_BOOST = 4;
const FALLBACK_MATCH_SCORE = 60;

/** Local strong/soft price affinities by budget preference (mirrors scoring.ts). */
const BUDGET_AFFINITY: Record<string, { strong: string[]; soft: string[] }> = {
  budget: { strong: ["free", "budget"], soft: ["moderate"] },
  balanced: { strong: ["budget", "moderate"], soft: ["free", "expensive"] },
  luxury: { strong: ["moderate", "expensive"], soft: ["budget"] },
};

/** Local group boost categories by travel group (mirrors scoring.ts). */
const GROUP_BOOST_CATEGORIES: Record<string, string[]> = {
  solo: ["adventure", "culture"],
  couple: ["food", "relaxation", "nightlife"],
  family: ["nature", "attractions"],
  friends: ["nightlife", "adventure", "food"],
};

const GROUP_LABELS: Record<string, string> = {
  solo: "solo travel",
  couple: "a couple",
  family: "families",
  friends: "friends travelling together",
};

const WEEKDAY_OFFSETS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function dateOnlyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

/**
 * Pure parser for traveller timing phrases. Deterministic given the same
 * message and `nowIso`. Returns a request — the decision layer only treats a
 * date as *grounded* when the actual forecast covers it.
 */
export function parseRequestedTiming(
  message: string,
  nowIso: string
): DecisionTimingRequest {
  const normalized = (message ?? "").trim().toLowerCase();
  const now = new Date(nowIso);

  let requestedDate: string | undefined;
  let dateNamed = false;

  if (/\btoday\b/.test(normalized)) {
    dateNamed = true;
    requestedDate = dateOnlyOf(now);
  } else if (/\btomorrow\b/.test(normalized)) {
    dateNamed = true;
    requestedDate = dateOnlyOf(addDays(now, 1));
  } else if (/\btonight\b/.test(normalized)) {
    dateNamed = true;
    requestedDate = dateOnlyOf(now);
  } else {
    const weekdayRegex =
      /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g;
    let match: RegExpExecArray | null;
    const found: string[] = [];
    while ((match = weekdayRegex.exec(normalized)) !== null) {
      found.push(match[0]);
    }
    if (found.length > 0) {
      const target = found[found.length - 1];
      const targetOffset = WEEKDAY_OFFSETS[target];
      let delta = (targetOffset - now.getUTCDay() + 7) % 7;
      if (delta === 0) delta = 7;
      dateNamed = true;
      requestedDate = dateOnlyOf(addDays(now, delta));
    }
  }

  return { dateNamed, requestedDate, partOfDay: detectPartOfDay(normalized) };
}

function detectPartOfDay(
  normalized: string
): DecisionTimingRequest["partOfDay"] {
  if (/\b(night|tonight|overnight|nightlife|late)\b/.test(normalized)) return "night";
  if (/\b(evening|dinner|sunset)\b/.test(normalized)) return "evening";
  if (/\b(afternoon|lunch|midday)\b/.test(normalized)) return "afternoon";
  if (/\b(morning|breakfast|brunch)\b/.test(normalized)) return "morning";
  return undefined;
}

/** Today's grounded forecast day, derived purely from real weather values. */
function currentDayFromWeather(
  weather: AiWeatherContext
): AiWeatherForecastDay | null {
  const today = dateOnlyOf(new Date(weather.retrievedAt));
  const forecastToday = weather.forecast.find((day) => day.date === today);
  if (forecastToday) return forecastToday;
  if (weather.current) {
    return {
      date: today,
      dayLabel: "",
      condition: weather.current.condition,
      conditionCode: weather.current.conditionCode,
      highC: weather.current.temperatureC,
      lowC: weather.current.temperatureC,
      precipitationProbabilityPercent: null,
    };
  }
  return null;
}

function categoryWeatherFit(category: string, lean: WeatherMatchLean): -1 | 0 | 1 {
  if (lean === "balanced") return 0;
  const indoor = INDOOR_CATEGORIES.has(category);
  const outdoor = OUTDOOR_CATEGORIES.has(category);
  if (lean === "indoor") return indoor ? 1 : outdoor ? -1 : 0;
  return outdoor ? 1 : indoor ? -1 : 0;
}

function weatherFactorLabel(
  daily: AiWeatherForecastDay,
  lean: WeatherMatchLean,
  cause: WeatherMatchCause
): string {
  if (cause === "rain") return `Good fit for ${daily.condition.toLowerCase()}`;
  if (cause === "heat") return `Good for a hot day (${daily.highC}°C)`;
  if (lean === "outdoor") return `Good fit for ${daily.condition.toLowerCase()}`;
  return "Works well in any weather";
}

function styleMatches(place: AssistantCandidatePlace, styles: string[]): boolean {
  if (styles.includes(place.category)) return true;
  const tagTokens = place.tags.map((tag) => tag.toLowerCase());
  return styles.some((style) =>
    tagTokens.some((tag) => tag === style || tag.includes(style) || style.includes(tag))
  );
}

function scorePlaceDecision(
  place: AssistantCandidatePlace,
  ctx: {
    preferences: RecommendationPreferences | undefined;
    usedPreferences: boolean;
    daily: AiWeatherForecastDay | null;
    lean: WeatherMatchLean | null;
    cause: WeatherMatchCause | null;
    usedWeather: boolean;
    usedTiming: boolean;
    scheduledSet: Set<string>;
  }
): PlaceDecision {
  const factors: DecisionFactor[] = [];

  const prefScore =
    typeof place.matchScore === "number" ? clamp(place.matchScore) : FALLBACK_MATCH_SCORE;

  const styles: string[] = ctx.preferences?.styles ?? [];
  if (ctx.usedPreferences) {
    if (styleMatches(place, styles)) {
      factors.push({ kind: "style", label: `Matches your ${styles.join(", ")} style` });
    }

    const budget = ctx.preferences?.budget;
    if (budget && BUDGET_AFFINITY[budget]) {
      const affinity = BUDGET_AFFINITY[budget];
      if (affinity.strong.includes(place.priceLevel)) {
        factors.push({ kind: "budget", label: `Fits your ${budget} budget` });
      } else if (affinity.soft.includes(place.priceLevel)) {
        factors.push({ kind: "budget", label: `Suitable for a ${budget} budget` });
      }
    }

    const group = ctx.preferences?.group;
    if (
      group &&
      GROUP_BOOST_CATEGORIES[group]?.includes(place.category)
    ) {
      factors.push({
        kind: "group",
        label: `Great for ${GROUP_LABELS[group] ?? group}`,
      });
    }
  }

  let weatherDelta = 0;
  let weatherFit = 0;
  if (ctx.usedWeather && ctx.daily && ctx.lean && ctx.cause) {
    weatherFit = categoryWeatherFit(place.category, ctx.lean);
    if (weatherFit > 0) {
      weatherDelta = WEATHER_MATCH_BONUS;
      factors.push({
        kind: "weather",
        label: weatherFactorLabel(ctx.daily, ctx.lean, ctx.cause),
      });
    } else if (weatherFit < 0) {
      weatherDelta = WEATHER_OPPOSE_PENALTY;
    }
  }

  let itineraryDelta = 0;
  if (ctx.scheduledSet.has(place.placeId)) {
    itineraryDelta = ITINERARY_BOOST;
    factors.push({ kind: "itinerary", label: "Already in your itinerary" });
  }

  let qualityDelta = 0;
  if (typeof place.rating === "number" && place.rating >= 4.5) {
    qualityDelta = QUALITY_BOOST;
    factors.push({ kind: "quality", label: "Top rated" });
  }

  if (ctx.usedTiming && weatherFit > 0 && ctx.daily?.dayLabel) {
    factors.push({
      kind: "timing",
      label: `Considered for ${ctx.daily.dayLabel}`,
    });
  }

  const score = clamp(Math.round(prefScore + weatherDelta + itineraryDelta + qualityDelta));

  return { placeId: place.placeId, score, factors };
}

/**
 * Build the deterministic decision from grounded inputs. Never throws, never
 * mutates its inputs, and never invents values that are not present in them.
 */
export function buildTravelDecision(input: TravelDecisionInput): TravelDecisionResult {
  const destinationSlug = input.destinationSlug.trim().toLowerCase();
  const preferences = input.preferences;
  const usedPreferences = hasPersonalizationPrefs(preferences);

  const restrictToPlaceIds =
    input.restrictToPlaceIds?.map((id) => id.trim()).filter(Boolean) ?? [];
  const usedSavedPlaces = restrictToPlaceIds.length > 0;

  let usablePlaces = input.candidatePlaces;
  if (usedSavedPlaces) {
    const allowed = new Set(restrictToPlaceIds);
    usablePlaces = input.candidatePlaces.filter((place) =>
      allowed.has(place.placeId)
    );
  }

  // Resolve which (if any) real forecast day drives the decision.
  const weather = input.weather ?? null;
  let daily: AiWeatherForecastDay | null = null;
  let usedTiming = false;
  const timingRequest = input.timing;
  if (weather) {
    if (timingRequest?.dateNamed) {
      daily = forecastDayForDate(weather, timingRequest.requestedDate);
      usedTiming = daily !== null;
    } else {
      daily = currentDayFromWeather(weather);
    }
  }
  const usedWeather = daily !== null;
  const dailyClassification =
    daily && usedWeather
      ? classifyForecastDay({
          weatherCode: daily.conditionCode,
          precipitationProbabilityPercent: daily.precipitationProbabilityPercent,
          temperatureMaxC: daily.highC,
        })
      : null;

  const scheduledPlaceIds = input.scheduledPlaceIds ?? [];
  const scheduledSet = new Set(scheduledPlaceIds);
  const usedTrip = scheduledPlaceIds.length > 0;

  const ranked = usablePlaces
    .map((place) =>
      scorePlaceDecision(place, {
        preferences,
        usedPreferences,
        daily,
        lean: dailyClassification?.lean ?? null,
        cause: dailyClassification?.cause ?? null,
        usedWeather,
        usedTiming,
        scheduledSet,
      })
    );

  const weatherFitPlaceIds = usablePlaces
    .filter((place) => {
      if (!dailyClassification) return false;
      return categoryWeatherFit(place.category, dailyClassification.lean) > 0;
    })
    .map((place) => place.placeId);

  const indexed = ranked.map((decision, index) => ({ decision, index }));
  indexed.sort((a, b) => {
    if (b.decision.score !== a.decision.score) return b.decision.score - a.decision.score;
    return a.index - b.index;
  });
  const rankedPlaces = indexed.map((entry) => entry.decision);

  const missingSignals: DecisionMissingSignal[] = [];
  if (!weather) missingSignals.push("weather");
  if (timingRequest?.dateNamed && !usedTiming) missingSignals.push("timing");
  if (scheduledPlaceIds.length === 0) missingSignals.push("trip");
  if (!usedPreferences) missingSignals.push("preferences");

  const summaryParts: string[] = [];
  summaryParts.push(
    `Ranked ${rankedPlaces.length} grounded place${rankedPlaces.length === 1 ? "" : "s"}`
  );
  if (usedPreferences) summaryParts.push("using your travel preferences");
  if (usedTiming && daily) {
    summaryParts.push(`for ${daily.dayLabel || daily.date}`);
  } else if (usedWeather && daily) {
    summaryParts.push(`factoring ${daily.condition.toLowerCase()} (${daily.date})`);
  }
  if (usedTrip) {
    summaryParts.push(`aligned with your itinerary of ${scheduledPlaceIds.length} planned place(s)`);
  }
  if (usedSavedPlaces) {
    summaryParts.push("limited to the saved places you asked about");
  }
  if (missingSignals.length > 0) {
    summaryParts.push(`no ${missingSignals.join(" or ")} context available`);
  }

  return {
    destinationSlug,
    destinationName: input.destinationName?.trim() || undefined,
    rankedPlaces,
    primary: rankedPlaces[0] ?? null,
    usedPreferences,
    usedWeather,
    weatherFitPlaceIds,
    usedTiming,
    timing: timingRequest,
    usedTrip,
    scheduledPlaceIds,
    usedSavedPlaces,
    missingSignals,
    summary: `${summaryParts.join(", ")}.`,
  };
}

/**
 * Projects a decision onto the chat response envelope. Purely a copy — it adds
 * no scoring and no new signals, so the client can render the deterministic
 * decision without re-deriving anything. `candidatePlaces` is used only to
 * resolve display names; the ranking and factors are passed through as-is.
 */
export function toAssistantDecisionSummary(
  decision: TravelDecisionResult,
  candidatePlaces: Pick<AssistantCandidatePlace, "placeId" | "name">[],
): AssistantDecisionSummary {
  const nameById = new Map(candidatePlaces.map((place) => [place.placeId, place.name]));
  const nameFor = (placeId: string) => nameById.get(placeId);

  return {
    selectedPlaceId: decision.primary?.placeId,
    selectedPlaceName: decision.primary ? nameFor(decision.primary.placeId) : undefined,
    rankedPlaces: decision.rankedPlaces.map((entry) => ({
      placeId: entry.placeId,
      placeName: nameFor(entry.placeId) ?? entry.placeId,
      score: entry.score,
      factors: entry.factors.map((factor) => ({
        kind: factor.kind,
        label: factor.label,
      })),
    })),
    summary: decision.summary,
    signalsUsed: {
      preferences: decision.usedPreferences,
      weather: decision.usedWeather,
      timing: decision.usedTiming,
      trip: decision.usedTrip,
      savedPlaces: decision.usedSavedPlaces,
    },
    missingSignals: [...decision.missingSignals],
  };
}