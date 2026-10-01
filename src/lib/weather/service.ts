import { CURATED_DESTINATIONS } from "@/lib/places/curatedData";
import { formatDestinationSlug, slugToTitle } from "@/lib/utils/slug";
import { weatherProvider, type WeatherProvider } from "./openMeteo";
import type {
  DestinationWeatherResponse,
  WeatherDestination,
} from "./types";

export interface ResolvedWeatherDestination extends WeatherDestination {
  latitude: number;
  longitude: number;
}

export function resolveDestinationCoordinates(
  slug: string
): ResolvedWeatherDestination | null {
  const normalized = formatDestinationSlug(slug ?? "");
  const dataset = normalized ? CURATED_DESTINATIONS[normalized] : undefined;
  if (!dataset) {
    return null;
  }
  const { latitude, longitude } = dataset.info.coordinates;
  return {
    slug: normalized,
    name: dataset.info.name,
    latitude,
    longitude,
  };
}

function destinationFor(slug: string): WeatherDestination {
  const normalized = formatDestinationSlug(slug ?? "");
  return {
    slug: normalized,
    name: normalized ? slugToTitle(normalized) : "",
  };
}

/**
 * Resolve a destination to its curated coordinates and fetch current weather
 * plus a compact daily forecast. Providers that only support current weather
 * keep working with an empty forecast. Unknown destinations and upstream
 * failures map onto a stable, safe envelope.
 */
export async function getDestinationWeather(
  slug: string,
  provider: WeatherProvider = weatherProvider
): Promise<DestinationWeatherResponse> {
  const resolved = resolveDestinationCoordinates(slug);
  if (!resolved) {
    return {
      status: "unavailable",
      reason: "unknown-destination",
      destination: destinationFor(slug),
    };
  }

  const destination = { slug: resolved.slug, name: resolved.name };

  try {
    if (typeof provider.getWeatherWithForecast === "function") {
      const { current, forecast } = await provider.getWeatherWithForecast(
        resolved.latitude,
        resolved.longitude
      );
      return { status: "available", destination, data: current, forecast };
    }

    const data = await provider.getCurrentWeather(
      resolved.latitude,
      resolved.longitude
    );
    return { status: "available", destination, data, forecast: [] };
  } catch {
    return {
      status: "unavailable",
      reason: "upstream",
      destination,
    };
  }
}