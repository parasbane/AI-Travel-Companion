export interface CurrentWeather {
  temperatureC: number;
  apparentTemperatureC: number;
  weatherCode: number;
  condition: string;
  windSpeedKmh: number;
  precipitationMm: number | null;
  rainMm: number | null;
  snowfallCm: number | null;
  observationTime: string;
  timezone: string;
  fetchedAt: string;
}

export interface DailyForecast {
  date: string;
  weatherCode: number;
  condition: string;
  temperatureMaxC: number;
  temperatureMinC: number;
  precipitationProbabilityPercent: number | null;
  windSpeedMaxKmh: number | null;
}

export interface WeatherWithForecast {
  current: CurrentWeather;
  forecast: DailyForecast[];
}

export type WeatherUnavailableReason = "unknown-destination" | "upstream";

export interface WeatherDestination {
  slug: string;
  name: string;
}

export type DestinationWeatherResponse =
  | {
      status: "available";
      destination: WeatherDestination;
      data: CurrentWeather;
      forecast: DailyForecast[];
    }
  | {
      status: "unavailable";
      reason: WeatherUnavailableReason;
      destination: WeatherDestination;
    };