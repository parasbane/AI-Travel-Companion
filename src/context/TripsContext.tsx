"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import {
  createTrip as createTripInService,
  deleteTrip as deleteTripInService,
  getTrips,
  reconcileTripDays,
  updateTrip as updateTripInService,
} from "@/lib/saved/tripsService";
import type { Trip, CreateTripInput, UpdateTripInput } from "@/lib/saved/types";

export interface TripsState {
  trips: Trip[];
  isLoading: boolean;
  error: string | null;
}

type TripsAction =
  | { type: "loading" }
  | { type: "loaded"; trips: Trip[] }
  | { type: "add"; trip: Trip }
  | { type: "update"; trip: Trip }
  | { type: "remove"; tripId: string }
  | { type: "error"; error: string }
  | { type: "reset" };

export const initialTripsState: TripsState = {
  trips: [],
  isLoading: true,
  error: null,
};

export function tripsReducer(state: TripsState, action: TripsAction): TripsState {
  switch (action.type) {
    case "loading":
      return { ...state, isLoading: true, error: null };
    case "loaded":
      return { trips: action.trips, isLoading: false, error: null };
    case "add":
      return {
        ...state,
        trips: [action.trip, ...state.trips],
        error: null,
      };
    case "update":
      return {
        ...state,
        trips: state.trips.map((item) =>
          item.id === action.trip.id ? action.trip : item
        ),
        error: null,
      };
    case "remove":
      return {
        ...state,
        trips: state.trips.filter((trip) => trip.id !== action.tripId),
        error: null,
      };
    case "error":
      return { ...state, isLoading: false, error: action.error };
    case "reset":
      return { trips: [], isLoading: false, error: null };
  }
}

interface TripsContextValue extends TripsState {
  refreshTrips: () => Promise<void>;
  createTrip: (input: CreateTripInput) => Promise<Trip | null>;
  updateTrip: (tripId: string, input: UpdateTripInput) => Promise<Trip | null>;
  deleteTrip: (tripId: string) => Promise<boolean>;
}

const TripsContext = createContext<TripsContextValue | undefined>(undefined);

export function TripsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [state, dispatch] = useReducer(tripsReducer, initialTripsState);
  const requestVersion = useRef(0);

  const refreshTrips = useCallback(async () => {
    if (!user) {
      ++requestVersion.current;
      dispatch({ type: "reset" });
      return;
    }

    const version = ++requestVersion.current;
    dispatch({ type: "loading" });
    try {
      const trips = await getTrips(user.id);
      if (version === requestVersion.current) {
        dispatch({ type: "loaded", trips });
      }
    } catch (error) {
      if (version === requestVersion.current) {
        dispatch({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to load trips",
        });
      }
    }
  }, [user]);

  useEffect(() => {
    if (isAuthLoading) return;
    void refreshTrips();
  }, [isAuthLoading, refreshTrips]);

  const createTrip = useCallback(
    async (input: CreateTripInput): Promise<Trip | null> => {
      if (!user) {
        dispatch({ type: "error", error: "Sign in to create trips" });
        return null;
      }

      try {
        const trip = await createTripInService(user.id, input);
        dispatch({ type: "add", trip });
        return trip;
      } catch (error) {
        dispatch({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to create trip",
        });
        return null;
      }
    },
    [user]
  );

  const updateTrip = useCallback(
    async (tripId: string, input: UpdateTripInput): Promise<Trip | null> => {
      if (!user) {
        dispatch({ type: "error", error: "Sign in to manage trips" });
        return null;
      }

      try {
        const updated = await updateTripInService(user.id, tripId, input);
        dispatch({ type: "update", trip: updated });
        await reconcileTripDays(user.id, tripId);
        return updated;
      } catch (error) {
        dispatch({
          type: "error",
          error:
            error instanceof Error ? error.message : "Failed to update trip",
        });
        return null;
      }
    },
    [user]
  );

  const deleteTrip = useCallback(
    async (tripId: string): Promise<boolean> => {
      if (!user) {
        dispatch({ type: "error", error: "Sign in to manage trips" });
        return false;
      }

      const removedTrip = state.trips.find((trip) => trip.id === tripId);
      if (!removedTrip) return false;

      ++requestVersion.current;
      dispatch({ type: "remove", tripId });
      try {
        await deleteTripInService(user.id, tripId);
        return true;
      } catch (error) {
        dispatch({ type: "add", trip: removedTrip });
        dispatch({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to delete trip",
        });
        return false;
      }
    },
    [state.trips, user]
  );

  const value = useMemo<TripsContextValue>(
    () => ({
      ...state,
      isLoading: isAuthLoading || state.isLoading,
      refreshTrips,
      createTrip,
      updateTrip,
      deleteTrip,
    }),
    [isAuthLoading, refreshTrips, createTrip, updateTrip, deleteTrip, state]
  );

  return (
    <TripsContext.Provider value={value}>
      {children}
    </TripsContext.Provider>
  );
}

export function useTrips(): TripsContextValue {
  const context = useContext(TripsContext);
  if (!context) {
    throw new Error("useTrips must be used within a TripsProvider");
  }
  return context;
}