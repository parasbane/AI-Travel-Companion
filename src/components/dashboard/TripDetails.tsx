"use client";

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import type { Place } from "@/lib/places/types";
import type { Trip, TripPlace, TripStatus } from "@/lib/saved/types";
import { useAuth } from "@/context/AuthContext";
import { PlaceProvider } from "@/lib/places/provider";
import { buildSavePlaceInput } from "@/lib/saved/placeToSaveInput";
import {
  addPlaceToTrip,
  getTripPlaces,
  removePlaceFromTrip,
} from "@/lib/saved/tripsService";
import PlaceCardSkeleton from "@/components/destinations/PlaceCardSkeleton";
import TripItinerary from "@/components/dashboard/TripItinerary";
import EditTripModal from "@/components/dashboard/EditTripModal";
import TravelAssistantChat from "@/components/ai/TravelAssistantChat";
import { slugToTitle } from "@/lib/utils/slug";
import {
  formatTripDateRange,
  tripDurationDays,
} from "@/lib/saved/tripDates";

const CATEGORY_COLORS: Record<string, string> = {
  culture: "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300",
  food: "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300",
  nature: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300",
  adventure: "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300",
  relaxation: "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300",
  nightlife: "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300",
  attractions: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300",
};

const STATUS_STYLES: Record<TripStatus, string> = {
  planning: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  upcoming: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
};

const NOTICE_MS = 3000;

function priceLabel(level: string | null | undefined): string {
  switch (level) {
    case "free":
      return "Free";
    case "budget":
      return "$";
    case "moderate":
      return "$$";
    case "expensive":
      return "$$$";
    default:
      return "";
  }
}

interface AddPlaceCardProps {
  place: Place;
  added: boolean;
  adding: boolean;
  onAdd: (place: Place) => void;
}

function AddPlaceCard({ place, added, adding, onAdd }: AddPlaceCardProps) {
  const categoryColor = CATEGORY_COLORS[place.category] || "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";
  const price = priceLabel(place.priceLevel);

  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={place.imageUrl}
          alt={place.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />

        <span
          className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm ${categoryColor}`}
        >
          {place.category}
        </span>

        {price && (
          <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {price}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-zinc-900 dark:text-white line-clamp-1">
            {place.name}
          </h3>
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <svg className="h-3.5 w-3.5 fill-amber-400" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span>{place.rating.toFixed(1)}</span>
          </div>
        </div>

        <p className="mt-2 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
          {place.shortDescription || place.description}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 p-4 pt-3 dark:border-zinc-800/80">
        <span className="truncate text-xs text-zinc-400 dark:text-zinc-500 max-w-[180px]">
          {place.address}
        </span>
        <button
          type="button"
          disabled={added || adding}
          onClick={() => onAdd(place)}
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
            added
              ? "cursor-default bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
              : "bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus-visible:ring-blue-500"
          } ${adding ? "opacity-70" : ""}`}
          aria-label={
            added
              ? `${place.name} is already in this trip`
              : `Add ${place.name} to this trip`
          }
        >
          {added ? (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              Added
            </>
          ) : adding ? (
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Adding
            </span>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add to trip
            </>
          )}
        </button>
      </div>
    </article>
  );
}

interface TripDetailsProps {
  trip: Trip;
}

interface TripDetailsState {
  places: TripPlace[];
  placesLoading: boolean;
  pickerPlaces: Place[];
  pickerLoading: boolean;
  pickerError: string | null;
  notice: { kind: "success" | "error"; text: string } | null;
}

type TripDetailsAction =
  | { type: "places-loaded"; places: TripPlace[] }
  | { type: "places-failed"; error: string }
  | { type: "picker-loading" }
  | { type: "picker-loaded"; places: Place[] }
  | { type: "picker-failed"; error: string }
  | { type: "place-added"; place: TripPlace }
  | { type: "place-removed"; placeId: string }
  | { type: "place-restored"; place: TripPlace }
  | { type: "notice"; notice: { kind: "success" | "error"; text: string } }
  | { type: "notice-cleared" };

const initialTripDetailsState: TripDetailsState = {
  places: [],
  placesLoading: true,
  pickerPlaces: [],
  pickerLoading: true,
  pickerError: null,
  notice: null,
};

function tripDetailsReducer(
  state: TripDetailsState,
  action: TripDetailsAction
): TripDetailsState {
  switch (action.type) {
    case "places-loaded":
      return { ...state, places: action.places, placesLoading: false };
    case "places-failed":
      return { ...state, placesLoading: false, notice: { kind: "error", text: action.error } };
    case "picker-loading":
      return { ...state, pickerLoading: true, pickerError: null };
    case "picker-loaded":
      return { ...state, pickerPlaces: action.places, pickerLoading: false };
    case "picker-failed":
      return { ...state, pickerLoading: false, pickerError: action.error };
    case "place-added":
      return state.places.some((p) => p.placeId === action.place.placeId)
        ? state
        : { ...state, places: [...state.places, action.place] };
    case "place-removed":
      return {
        ...state,
        places: state.places.some((p) => p.placeId === action.placeId)
          ? state.places.filter((p) => p.placeId !== action.placeId)
          : state.places,
      };
    case "place-restored":
      return state.places.some((p) => p.placeId === action.place.placeId)
        ? state
        : { ...state, places: [...state.places, action.place] };
    case "notice":
      return { ...state, notice: action.notice };
    case "notice-cleared":
      return { ...state, notice: null };
  }
}

export default function TripDetails({ trip }: TripDetailsProps) {
  const { user } = useAuth();

  const [state, dispatch] = useReducer(tripDetailsReducer, initialTripDetailsState);
  const { places, placesLoading, pickerPlaces, pickerLoading, pickerError, notice } = state;
  const [addingPlaceId, setAddingPlaceId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  const requestVersion = useRef(0);
  const pickerRequestVersion = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const showNotice = useCallback(
    (kind: "success" | "error", text: string) => {
      dispatch({ type: "notice", notice: { kind, text } });
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
      noticeTimerRef.current = setTimeout(
        () => dispatch({ type: "notice-cleared" }),
        NOTICE_MS
      );
    },
    []
  );

  const loadTripPlaces = useCallback(async () => {
    if (!user) return;
    const version = ++requestVersion.current;
    try {
      const items = await getTripPlaces(user.id, trip.id);
      if (version === requestVersion.current) {
        dispatch({ type: "places-loaded", places: items });
      }
    } catch (error) {
      if (version === requestVersion.current) {
        dispatch({
          type: "places-failed",
          error: error instanceof Error ? error.message : "Could not load trip places",
        });
      }
    }
  }, [user, trip.id]);

  const loadPickerPlaces = useCallback(async () => {
    const version = ++pickerRequestVersion.current;
    dispatch({ type: "picker-loading" });
    try {
      const data = await PlaceProvider.getDestinationPlaces(trip.destinationSlug);
      if (version === pickerRequestVersion.current) {
        dispatch({ type: "picker-loaded", places: data.places });
      }
    } catch (error) {
      if (version === pickerRequestVersion.current) {
        dispatch({
          type: "picker-failed",
          error: error instanceof Error
            ? error.message
            : "Could not load places for this destination",
        });
      }
    }
  }, [trip.destinationSlug]);

  useEffect(() => {
    void loadTripPlaces();
  }, [loadTripPlaces]);

  useEffect(() => {
    void loadPickerPlaces();
  }, [loadPickerPlaces]);

  const handleRetryPicker = () => {
    void loadPickerPlaces();
  };

  const addedPlaceIds = useMemo(
    () => new Set(places.map((place) => place.placeId)),
    [places]
  );

  const handleAddPlace = async (place: Place) => {
    if (!user || addingPlaceId || addedPlaceIds.has(place.id)) return;

    setAddingPlaceId(place.id);
    try {
      const added = await addPlaceToTrip(user.id, {
        tripId: trip.id,
        ...buildSavePlaceInput(place),
      });
      dispatch({ type: "place-added", place: added });
      showNotice("success", `Added "${place.name}" to ${trip.title}`);
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error ? error.message : "Could not add this place to the trip"
      );
    } finally {
      setAddingPlaceId(null);
    }
  };

  const handleRemovePlace = async (place: TripPlace) => {
    if (!user) return;

    dispatch({ type: "place-removed", placeId: place.placeId });

    try {
      await removePlaceFromTrip(user.id, {
        tripId: trip.id,
        placeId: place.placeId,
      });
      // The service also removes the place's itinerary entries, so rebuild
      // the itinerary to drop them from the UI and refresh summary counts.
      setReloadVersion((version) => version + 1);
    } catch (error) {
      dispatch({ type: "place-restored", place });
      showNotice(
        "error",
        error instanceof Error ? error.message : "Could not remove this place from the trip"
      );
    }
  };

  const destinationName = trip.destinationName || slugToTitle(trip.destinationSlug);
  const days = tripDurationDays(trip);
  const pickerCount = pickerPlaces.length - addedPlaceIds.size;

  return (
    <div className="w-full">
      <div className="mb-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to dashboard
        </Link>
      </div>

      <div className="rounded-3xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 rounded-t-3xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-600 px-6 py-8 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <span
              className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm ${STATUS_STYLES[trip.status]}`}
            >
              {trip.status}
            </span>
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label={`Edit ${trip.title}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          </div>
          <h1 className="text-2xl font-extrabold text-white drop-shadow-sm sm:text-3xl">
            {trip.title}
          </h1>
          <p className="text-sm text-white/90">{destinationName}</p>
        </div>

        <dl className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4 sm:px-8">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Destination
            </dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {destinationName}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Dates
            </dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {formatTripDateRange(trip)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Duration
            </dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {days !== null ? `${days} day${days === 1 ? "" : "s"}` : "Not set"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Places
            </dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {placesLoading ? "\u2026" : `${places.length} added`}
            </dd>
          </div>
        </dl>

        {notice && (
          <p
            role={notice.kind === "error" ? "alert" : "status"}
            className={`mx-6 sm:mx-8 mb-2 rounded-xl border px-4 py-2.5 text-xs font-semibold animate-fadeIn ${
              notice.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
            }`}
          >
            {notice.text}
          </p>
        )}

        <div className="border-t border-zinc-100 p-6 pt-6 sm:px-8 dark:border-zinc-800/80">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Places in this trip
            </h2>
            {!placesLoading && places.length > 0 && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                {places.length}
              </span>
            )}
          </div>

          {placesLoading ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 2 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-20 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800"
                />
              ))}
            </div>
          ) : places.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-zinc-200 p-8 text-center dark:border-zinc-800 animate-fadeIn">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-xl text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                📌
              </div>
              <h3 className="mt-3 text-base font-bold text-zinc-900 dark:text-white">
                No places added yet
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
                Pick highlights from {destinationName} below and they will show up here.
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {places.map((place) => {
                const categoryColor =
                  CATEGORY_COLORS[place.placeCategory] || "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";
                const price = priceLabel(place.placePriceLevel);
                return (
                  <article
                    key={place.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="relative h-32 w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                      {place.placeImageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={place.placeImageUrl}
                          alt={place.placeName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl text-zinc-300 dark:text-zinc-600">
                          📍
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                      <span
                        className={`absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm ${categoryColor}`}
                      >
                        {place.placeCategory}
                      </span>
                      {price && (
                        <div className="absolute bottom-2.5 right-2.5 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                          {price}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white line-clamp-1">
                          {place.placeName}
                        </h3>
                        <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                          {slugToTitle(place.destinationSlug)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemovePlace(place)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-rose-600 transition-colors hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-400 dark:hover:text-rose-300"
                        aria-label={`Remove ${place.placeName} from this trip`}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <TripItinerary key={reloadVersion} trip={trip} places={places} placesLoading={placesLoading} />

      <TravelAssistantChat
        destinationSlug={trip.destinationSlug}
        destinationName={destinationName}
        tripId={trip.id}
        onTripUpdated={() => setReloadVersion((version) => version + 1)}
      />

      <EditTripModal
        trip={trip}
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSaved={() => setReloadVersion((version) => version + 1)}
      />

      <section
        className="mt-8 rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        aria-labelledby="add-places-heading"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 id="add-places-heading" className="text-xl font-bold text-zinc-900 dark:text-white">
            Add places to {trip.title}
          </h2>
          {!pickerLoading && pickerCount > 0 && (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              {pickerCount} to pick
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Popular highlights in {destinationName}.
        </p>

        {pickerError && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 animate-fadeIn">
            <span>{pickerError}</span>
            <button
              type="button"
              onClick={handleRetryPicker}
              className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-rose-700"
            >
              Try again
            </button>
          </div>
        )}

        {pickerLoading ? (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <PlaceCardSkeleton key={idx} />
            ))}
          </div>
        ) : pickerPlaces.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pickerPlaces.map((place) => (
              <AddPlaceCard
                key={place.id}
                place={place}
                added={addedPlaceIds.has(place.id)}
                adding={addingPlaceId === place.id}
                onAdd={handleAddPlace}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-zinc-200 p-8 text-center dark:border-zinc-800">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              No places available for {destinationName}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
              This destination does not have highlights to add yet.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}