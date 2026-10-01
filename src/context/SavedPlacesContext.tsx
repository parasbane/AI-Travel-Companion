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
  getSavedPlaces,
  removeSavedPlace as removeSavedPlaceFromService,
  savePlace as savePlaceToService,
} from "@/lib/saved/savedPlacesService";
import type { SavedPlace, SavePlaceInput } from "@/lib/saved/types";

export interface SavedPlacesState {
  savedPlaces: SavedPlace[];
  isLoading: boolean;
  error: string | null;
}

type SavedPlacesAction =
  | { type: "loading" }
  | { type: "loaded"; savedPlaces: SavedPlace[] }
  | { type: "add"; savedPlace: SavedPlace }
  | { type: "replace"; temporaryId: string; savedPlace: SavedPlace }
  | { type: "remove"; placeId: string }
  | { type: "error"; error: string }
  | { type: "reset" };

export const initialSavedPlacesState: SavedPlacesState = {
  savedPlaces: [],
  isLoading: true,
  error: null,
};

export function savedPlacesReducer(
  state: SavedPlacesState,
  action: SavedPlacesAction
): SavedPlacesState {
  switch (action.type) {
    case "loading":
      return { ...state, isLoading: true, error: null };
    case "loaded":
      return { savedPlaces: action.savedPlaces, isLoading: false, error: null };
    case "add":
      return {
        ...state,
        savedPlaces: [action.savedPlace, ...state.savedPlaces],
        error: null,
      };
    case "replace":
      return {
        ...state,
        savedPlaces: state.savedPlaces.map((savedPlace) =>
          savedPlace.id === action.temporaryId ? action.savedPlace : savedPlace
        ),
        error: null,
      };
    case "remove":
      return {
        ...state,
        savedPlaces: state.savedPlaces.filter(
          (savedPlace) => savedPlace.placeId !== action.placeId
        ),
        error: null,
      };
    case "error":
      return { ...state, isLoading: false, error: action.error };
    case "reset":
      return { savedPlaces: [], isLoading: false, error: null };
  }
}

function toOptimisticSavedPlace(userId: string, input: SavePlaceInput): SavedPlace {
  const now = new Date().toISOString();
  return {
    id: `optimistic_${input.placeId}_${Date.now()}`,
    userId,
    placeId: input.placeId,
    destinationSlug: input.destinationSlug,
    placeName: input.placeName,
    placeCategory: input.placeCategory,
    placeImageUrl: input.placeImageUrl ?? null,
    placeRating: input.placeRating ?? null,
    placePriceLevel: input.placePriceLevel ?? null,
    placeAddress: input.placeAddress ?? null,
    createdAt: now,
  };
}

interface SavedPlacesContextValue extends SavedPlacesState {
  savedPlaceIds: ReadonlySet<string>;
  isPlaceSaved: (placeId: string) => boolean;
  savePlace: (input: SavePlaceInput) => Promise<SavedPlace | null>;
  removeSavedPlace: (placeId: string) => Promise<boolean>;
  toggleSavedPlace: (input: SavePlaceInput) => Promise<boolean>;
  refreshSavedPlaces: () => Promise<void>;
}

const SavedPlacesContext = createContext<SavedPlacesContextValue | undefined>(
  undefined
);

export function SavedPlacesProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [state, dispatch] = useReducer(savedPlacesReducer, initialSavedPlacesState);
  const requestVersion = useRef(0);

  const refreshSavedPlaces = useCallback(async () => {
    if (!user) {
      ++requestVersion.current;
      dispatch({ type: "reset" });
      return;
    }

    const version = ++requestVersion.current;
    dispatch({ type: "loading" });
    try {
      const savedPlaces = await getSavedPlaces(user.id);
      if (version === requestVersion.current) {
        dispatch({ type: "loaded", savedPlaces });
      }
    } catch (error) {
      if (version === requestVersion.current) {
        dispatch({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to load saved places",
        });
      }
    }
  }, [user]);

  useEffect(() => {
    if (isAuthLoading) return;
    void refreshSavedPlaces();
  }, [isAuthLoading, refreshSavedPlaces]);

  const savePlace = useCallback(
    async (input: SavePlaceInput): Promise<SavedPlace | null> => {
      if (!user) {
        dispatch({ type: "error", error: "Sign in to save places" });
        return null;
      }

      const existing = state.savedPlaces.find(
        (savedPlace) => savedPlace.placeId === input.placeId
      );
      if (existing) return existing;

      const optimisticSavedPlace = toOptimisticSavedPlace(user.id, input);
      ++requestVersion.current;
      dispatch({ type: "add", savedPlace: optimisticSavedPlace });

      try {
        const savedPlace = await savePlaceToService(user.id, input);
        dispatch({
          type: "replace",
          temporaryId: optimisticSavedPlace.id,
          savedPlace,
        });
        return savedPlace;
      } catch (error) {
        dispatch({ type: "remove", placeId: input.placeId });
        dispatch({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to save place",
        });
        return null;
      }
    },
    [state.savedPlaces, user]
  );

  const removeSavedPlace = useCallback(
    async (placeId: string): Promise<boolean> => {
      if (!user) {
        dispatch({ type: "error", error: "Sign in to manage saved places" });
        return false;
      }

      const removedPlace = state.savedPlaces.find(
        (savedPlace) => savedPlace.placeId === placeId
      );
      if (!removedPlace) return false;

      ++requestVersion.current;
      dispatch({ type: "remove", placeId });
      try {
        await removeSavedPlaceFromService(user.id, placeId);
        return true;
      } catch (error) {
        dispatch({ type: "add", savedPlace: removedPlace });
        dispatch({
          type: "error",
          error: error instanceof Error ? error.message : "Failed to remove saved place",
        });
        return false;
      }
    },
    [state.savedPlaces, user]
  );

  const isPlaceSaved = useCallback(
    (placeId: string) => state.savedPlaces.some((savedPlace) => savedPlace.placeId === placeId),
    [state.savedPlaces]
  );

  const toggleSavedPlace = useCallback(
    async (input: SavePlaceInput): Promise<boolean> => {
      if (isPlaceSaved(input.placeId)) {
        return !(await removeSavedPlace(input.placeId));
      }
      return Boolean(await savePlace(input));
    },
    [isPlaceSaved, removeSavedPlace, savePlace]
  );

  const savedPlaceIds = useMemo(
    () => new Set(state.savedPlaces.map((savedPlace) => savedPlace.placeId)),
    [state.savedPlaces]
  );

  const value = useMemo<SavedPlacesContextValue>(
    () => ({
      ...state,
      isLoading: isAuthLoading || state.isLoading,
      savedPlaceIds,
      isPlaceSaved,
      savePlace,
      removeSavedPlace,
      toggleSavedPlace,
      refreshSavedPlaces,
    }),
    [
      isAuthLoading,
      isPlaceSaved,
      refreshSavedPlaces,
      removeSavedPlace,
      savePlace,
      savedPlaceIds,
      state,
      toggleSavedPlace,
    ]
  );

  return (
    <SavedPlacesContext.Provider value={value}>
      {children}
    </SavedPlacesContext.Provider>
  );
}

export function useSavedPlaces(): SavedPlacesContextValue {
  const context = useContext(SavedPlacesContext);
  if (!context) {
    throw new Error("useSavedPlaces must be used within a SavedPlacesProvider");
  }
  return context;
}
