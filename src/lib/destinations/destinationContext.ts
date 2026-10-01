import { CURATED_DESTINATIONS } from "@/lib/places/curatedData";
import type {
  SpecificPlaceCategory,
  TravelGroupPreference,
} from "@/lib/places/types";
import { formatDestinationSlug, slugToTitle } from "@/lib/utils/slug";

/**
 * Curated editorial context for a destination. Static and deterministic —
 * never derived from live data, never fabricated for unknown destinations.
 */
export interface DestinationContextCurated {
  overview: string;
  goodFor: string[];
  planningTips: string[];
  notesByGroup: Record<TravelGroupPreference, string>;
}

export interface DestinationContext {
  slug: string;
  name: string;
  hasCuratedContext: boolean;
  overview: string;
  goodFor: string[];
  planningTips: string[];
  /** Reused from the existing curated destination dataset's popular categories. */
  availableCategories: SpecificPlaceCategory[];
  travelerNotes: Record<TravelGroupPreference, string>;
}

export const TRAVEL_GROUP_PREFERENCE_IDS: TravelGroupPreference[] = [
  "solo",
  "couple",
  "friends",
  "family",
];

const GENERIC_OVERVIEW =
  "Curated planning context for this destination is not available yet. Explore the places and categories below to build your own picture.";

const GENERIC_TRAVELER_NOTES: Record<TravelGroupPreference, string> = {
  solo: "Travel at your own pace and pick stops from the categories below.",
  couple: "Pair one landmark stop with one relaxed break from the picks below.",
  friends: "Split across interest categories, then regroup for food and evenings.",
  family: "Mix one highlight with one easy-going stop to keep days light.",
};

const CURATED_CONTEXTS: Record<string, DestinationContextCurated> = {
  goa: {
    overview:
      "Goa pairs Arabian Sea beaches with Portuguese-era churches, spice-farm country, and an unhurried coastal rhythm — the days lean toward beach time, heritage stops, and long seafood dinners.",
    goodFor: [
      "Beach days",
      "Portuguese-era heritage",
      "Seafood & beach shacks",
      "Sunset boat trips",
      "Spice-farm nature walks",
    ],
    planningTips: [
      "November to March is the mildest window for outdoor evenings and beach days.",
      "Northern beaches feel livelier and busier; the south is quieter — skim the categories below before choosing a base.",
      "Pack swimwear, sun protection, and a light layer for breezy nights.",
      "Dress modestly when visiting churches, temples, and village areas.",
    ],
    notesByGroup: {
      solo: "An easy solo rhythm: beach mornings, cafés, and short heritage stops.",
      couple: "Sunset beaches, quiet heritage lanes, and long seafood dinners suit couples.",
      friends: "Beach shacks, markets, and lively evenings keep groups entertained.",
      family: "Calm beaches, spice-farm visits, and short heritage stops keep the pace gentle.",
    },
  },
  tokyo: {
    overview:
      "Tokyo layers shrines, gardens, and quiet backstreets under dense city districts — neighborhoods are distinct, so days group naturally by area.",
    goodFor: [
      "Shrines & temples",
      "Skyline views",
      "Markets & street food",
      "City parks",
      "Late-night culture",
    ],
    planningTips: [
      "Spring and autumn bring mild temperatures; summer is hot and humid.",
      "Group sights by neighborhood — the rail and subway network links districts quickly.",
      "Carry some cash alongside a card for smaller purchases.",
      "An IC transit card keeps day-to-day city trips simple.",
    ],
    notesByGroup: {
      solo: "Walkable districts and compact food spots make solo days easy to improvise.",
      couple: "Garden mornings, skyline evenings, and backstreet ramen runs suit pairs.",
      friends: "Arcades, markets, and late-night districts spread well across a group.",
      family: "Parks, temples, and short inter-district days keep families comfortable.",
    },
  },
  paris: {
    overview:
      "Paris concentrates landmarks, museums, and café culture along the Seine, with distinct neighborhoods a short ride apart — the walkable center makes for easy half-day themes.",
    goodFor: [
      "Landmarks",
      "Museums & art",
      "Café culture",
      "Gardens",
      "Pastry & markets",
    ],
    planningTips: [
      "Spring and autumn balance mild weather with thinner crowds.",
      "Museums draw the steadiest crowds — consider opening or late slots when available.",
      "Central sights cluster walkably, so bring comfortable shoes.",
      "A Seine-side picnic or garden break is an easy low-cost reset.",
    ],
    notesByGroup: {
      solo: "Cafés, galleries, and short walks between landmarks keep a solo day flexible.",
      couple: "Riverside walks, garden benches, and unhurried café stops suit couples.",
      friends: "Markets, food halls, and evening neighborhoods give groups plenty to split across.",
      family: "Gardens, landmarks, and pastry stops make relaxed, short-loop days.",
    },
  },
  bali: {
    overview:
      "Bali mixes temple sites, rice terraces, volcano trails, and beach towns across a compact island — a day usually focuses on either the interior or one coastal area rather than both.",
    goodFor: [
      "Temples",
      "Rice terraces",
      "Sunrise hikes",
      "Beach time",
      "Spa & yoga",
    ],
    planningTips: [
      "April to October is the drier window for hikes, terraces, and beach days.",
      "Plan a day as interior or coast rather than both — the island rewards slow pacing.",
      "Dress modestly at temples and carry a light scarf.",
      "Keep beach and sun gear handy for outdoor afternoons.",
    ],
    notesByGroup: {
      solo: "Yoga mornings, café breaks, and easy beach afternoons flex well for solo trips.",
      couple: "Temple sunsets, spa afternoons, and terrace walks suit couples.",
      friends: "Beach clubs, group hikes, and villa evenings give friends plenty to mix.",
      family: "Calm beach bays, short terrace walks, and pool afternoons keep families relaxed.",
    },
  },
};

/**
 * Resolve editorial context for a destination slug.
 * Unknown/non-curated destinations return a safe, limited generic state
 * with no destination-specific facts.
 */
export function getDestinationContext(slug: string): DestinationContext {
  const normalized = formatDestinationSlug(slug ?? "");
  const curated = CURATED_CONTEXTS[normalized];
  const dataset = CURATED_DESTINATIONS[normalized];

  if (curated && dataset) {
    return {
      slug: normalized,
      name: dataset.info.name,
      hasCuratedContext: true,
      overview: curated.overview,
      goodFor: [...curated.goodFor],
      planningTips: [...curated.planningTips],
      availableCategories: [...dataset.info.popularCategories],
      travelerNotes: { ...curated.notesByGroup },
    };
  }

  return {
    slug: normalized,
    name: normalized ? slugToTitle(normalized) : "",
    hasCuratedContext: false,
    overview: GENERIC_OVERVIEW,
    goodFor: [],
    planningTips: [],
    availableCategories: [],
    travelerNotes: { ...GENERIC_TRAVELER_NOTES },
  };
}