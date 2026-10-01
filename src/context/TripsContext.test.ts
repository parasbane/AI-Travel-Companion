import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  initialTripsState,
  tripsReducer,
  type TripsState,
} from "./TripsContext";
import type { Trip } from "@/lib/saved/types";

const trip: Trip = {
  id: "trip-1",
  userId: "user-a",
  title: "Goa Getaway",
  destinationSlug: "goa",
  destinationName: "Goa",
  description: null,
  startDate: "2026-12-01",
  endDate: "2026-12-05",
  status: "planning",
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
};

describe("TripsContext state behavior", () => {
  test("models loading and refresh completion", () => {
    const loading = tripsReducer(initialTripsState, { type: "loading" });
    const loaded = tripsReducer(loading, { type: "loaded", trips: [trip] });

    assert.equal(loading.isLoading, true);
    assert.equal(loaded.isLoading, false);
    assert.deepEqual(loaded.trips, [trip]);
  });

  test("supports add, remove, and error recovery", () => {
    const added = tripsReducer(initialTripsState, { type: "add", trip });
    const removed = tripsReducer(added, { type: "remove", tripId: trip.id });
    const recovered = tripsReducer(removed, { type: "add", trip });
    const failed: TripsState = tripsReducer(recovered, {
      type: "error",
      error: "Network unavailable",
    });

    assert.equal(added.trips.length, 1);
    assert.equal(removed.trips.length, 0);
    assert.equal(recovered.trips.length, 1);
    assert.equal(failed.error, "Network unavailable");
    assert.equal(failed.isLoading, false);
  });

  test("replaces a trip in place on update", () => {
    const updatedTrip: Trip = {
      ...trip,
      title: "Goa Reunion",
      startDate: "2026-12-10",
      endDate: "2026-12-12",
      status: "upcoming",
    };
    const added = tripsReducer(initialTripsState, { type: "add", trip });
    const updated = tripsReducer(added, { type: "update", trip: updatedTrip });

    assert.equal(updated.trips.length, 1);
    assert.equal(updated.trips[0].title, "Goa Reunion");
    assert.equal(updated.trips[0].status, "upcoming");
    assert.equal(updated.error, null);
  });

  test("resets to an unauthenticated state", () => {
    const state = tripsReducer(initialTripsState, {
      type: "loaded",
      trips: [trip],
    });
    const reset = tripsReducer(state, { type: "reset" });

    assert.deepEqual(reset.trips, []);
    assert.equal(reset.isLoading, false);
    assert.equal(reset.error, null);
  });
});