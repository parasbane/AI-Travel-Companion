import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WEATHER_UNITS_STORAGE_KEY,
} from "./units";
import {
  persistWeatherUnitSystem,
  readWeatherUnitSystem,
  type WeatherUnitStorage,
} from "./unitPreference";

function memoryStorage(
  initial: Record<string, string> = {},
): { storage: WeatherUnitStorage; get: (key: string) => string | null } {
  const store = new Map(Object.entries(initial));
  return {
    storage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
    get: (key: string) => store.get(key) ?? null,
  };
}

describe("weather unit preference persistence", () => {
  it("defaults to metric when nothing is stored", () => {
    const { storage } = memoryStorage();
    assert.equal(readWeatherUnitSystem(storage), "metric");
  });

  it("reads a persisted imperial preference", () => {
    const { storage } = memoryStorage({ [WEATHER_UNITS_STORAGE_KEY]: "imperial" });
    assert.equal(readWeatherUnitSystem(storage), "imperial");
  });

  it("reads a persisted metric preference", () => {
    const { storage } = memoryStorage({ [WEATHER_UNITS_STORAGE_KEY]: "metric" });
    assert.equal(readWeatherUnitSystem(storage), "metric");
  });

  it("falls back to metric when the persisted value is invalid", () => {
    const { storage } = memoryStorage({ [WEATHER_UNITS_STORAGE_KEY]: "kelvin" });
    assert.equal(readWeatherUnitSystem(storage), "metric");
  });

  it("persists the selected unit system under the stable key", () => {
    const { storage, get } = memoryStorage();
    persistWeatherUnitSystem("imperial", storage);
    assert.equal(get(WEATHER_UNITS_STORAGE_KEY), "imperial");
    assert.equal(readWeatherUnitSystem(storage), "imperial");
  });

  it("tolerates storage being unavailable", () => {
    assert.equal(readWeatherUnitSystem(null), "metric");
    assert.doesNotThrow(() => persistWeatherUnitSystem("imperial", null));
  });
});