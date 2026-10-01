"use client";

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  Trip,
  TripPlace,
  TripDay,
  ItineraryItem,
  TripPlanIssueSeverity,
} from "@/lib/saved/types";
import { useAuth } from "@/context/AuthContext";
import {
  addPlaceToItinerary,
  createTripDays,
  getItineraryItems,
  getTripDays,
  moveItineraryItem,
  removeItineraryItem,
  reorderItineraryItems,
  updateItineraryItem,
} from "@/lib/saved/tripsService";
import { formatTimeRange, formatTripDate } from "@/lib/saved/tripDates";
import { orderItineraryItems } from "@/lib/saved/itineraryOrder";
import { buildTripPlan, unassignedTripPlaces } from "@/lib/saved/tripPlan";
import { analyzeTripPlan } from "@/lib/saved/tripPlanReport";
import ItineraryPlannerModal from "@/components/dashboard/ItineraryPlannerModal";
import {
  SEVERITY_META,
  countIssuesBySeverity,
  formatIssueDay,
  groupIssuesBySeverity,
  resolveIssuePlaceName,
} from "@/components/dashboard/itineraryReport";
import { computeTripReadiness } from "@/components/dashboard/tripReadiness";
import TripReadinessCard from "@/components/dashboard/TripReadinessCard";
import {
  computeSmartDaySuggestions,
  type SmartDaySuggestion,
} from "@/components/dashboard/smartDaySuggestions";
import SmartDaySuggestionsCard from "@/components/dashboard/SmartDaySuggestionsCard";

const CATEGORY_COLORS: Record<string, string> = {
  culture: "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300",
  food: "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300",
  nature: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300",
  adventure: "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300",
  relaxation: "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300",
  nightlife: "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300",
  attractions: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300",
};

const SEVERITY_BADGE: Record<TripPlanIssueSeverity, string> = {
  error: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
};

const SEVERITY_DOT: Record<TripPlanIssueSeverity, string> = {
  error: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const NOTICE_MS = 3000;

interface TripItineraryProps {
  trip: Trip;
  places: TripPlace[];
  placesLoading: boolean;
}

interface TripItineraryState {
  days: TripDay[];
  daysLoading: boolean;
  items: ItineraryItem[];
  itemsLoading: boolean;
  addDayId: string | null;
  addingPlaceId: string | null;
  editingItemId: string | null;
  notice: { kind: "success" | "error"; text: string } | null;
}

type TripItineraryAction =
  | { type: "days-loaded"; days: TripDay[] }
  | { type: "days-failed"; error: string }
  | { type: "items-loaded"; items: ItineraryItem[] }
  | { type: "picker-open"; dayId: string }
  | { type: "picker-close" }
  | { type: "item-added"; item: ItineraryItem }
  | { type: "item-removed"; itemId: string }
  | { type: "item-restored"; item: ItineraryItem }
  | { type: "item-updated"; item: ItineraryItem }
  | { type: "items-reordered"; items: ItineraryItem[] }
  | { type: "adding-start"; placeId: string }
  | { type: "adding-end" }
  | { type: "edit-start"; itemId: string }
  | { type: "edit-cancel" }
  | { type: "notice"; notice: { kind: "success" | "error"; text: string } }
  | { type: "notice-cleared" };

const initialState: TripItineraryState = {
  days: [],
  daysLoading: true,
  items: [],
  itemsLoading: true,
  addDayId: null,
  addingPlaceId: null,
  editingItemId: null,
  notice: null,
};

function tripItineraryReducer(
  state: TripItineraryState,
  action: TripItineraryAction
): TripItineraryState {
  switch (action.type) {
    case "days-loaded":
      return { ...state, days: action.days, daysLoading: false };
    case "days-failed":
      return { ...state, daysLoading: false, notice: { kind: "error", text: action.error } };
    case "items-loaded":
      return { ...state, items: action.items, itemsLoading: false };
    case "picker-open":
      return { ...state, addDayId: action.dayId, editingItemId: null };
    case "picker-close":
      return { ...state, addDayId: null };
    case "item-added":
      return state.items.some((i) => i.id === action.item.id)
        ? state
        : { ...state, items: [...state.items, action.item] };
    case "item-removed":
      return {
        ...state,
        items: state.items.some((i) => i.id === action.itemId)
          ? state.items.filter((i) => i.id !== action.itemId)
          : state.items,
      };
    case "item-restored":
      return state.items.some((i) => i.id === action.item.id)
        ? state
        : { ...state, items: [...state.items, action.item] };
    case "item-updated":
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.item.id ? action.item : i
        ),
      };
    case "items-reordered":
      return { ...state, items: action.items };
    case "adding-start":
      return { ...state, addingPlaceId: action.placeId };
    case "adding-end":
      return { ...state, addingPlaceId: null };
    case "edit-start":
      return { ...state, editingItemId: action.itemId, addDayId: null };
    case "edit-cancel":
      return { ...state, editingItemId: null };
    case "notice":
      return { ...state, notice: action.notice };
    case "notice-cleared":
      return { ...state, notice: null };
  }
}

function StopTimeControl({
  item,
  onSetTime,
}: {
  item: ItineraryItem;
  onSetTime: (startTime: string | null) => void;
}) {
  const timeLabel = formatTimeRange(item.startTime, item.endTime);

  return (
    <span className="inline-flex items-center gap-1">
      <span className="relative inline-flex items-center">
        {timeLabel ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {timeLabel}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs italic text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Time not set
          </span>
        )}
        <input
          type="time"
          value={item.startTime ?? ""}
          onChange={(event) => onSetTime(event.target.value === "" ? null : event.target.value)}
          aria-label={`Set time for ${item.placeName}`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      {item.startTime && (
        <button
          type="button"
          onClick={() => onSetTime(null)}
          aria-label={`Clear time for ${item.placeName}`}
          className="rounded-full p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-zinc-800"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

function swapSortOrders(
  items: ItineraryItem[],
  dayId: string,
  fromId: string,
  toId: string
): ItineraryItem[] {
  const dayItems = items.filter((i) => i.tripDayId === dayId);
  const from = dayItems.find((i) => i.id === fromId);
  const to = dayItems.find((i) => i.id === toId);
  if (!from || !to) return items;
  return items.map((i) => {
    if (i.id === from.id) return { ...i, sortOrder: to.sortOrder };
    if (i.id === to.id) return { ...i, sortOrder: from.sortOrder };
    return i;
  });
}

interface SummaryStatProps {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "warn" | "error" | "info";
}

function SummaryStat({ label, value, tone = "neutral" }: SummaryStatProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
        tone === "warn"
          ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40"
          : tone === "error"
            ? "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40"
            : tone === "info"
              ? "border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/40"
              : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      }`}
    >
      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </span>
      <span
        className={`text-sm font-bold tabular-nums ${
          tone === "warn"
            ? "text-amber-700 dark:text-amber-300"
            : tone === "error"
              ? "text-rose-700 dark:text-rose-300"
              : tone === "info"
                ? "text-blue-700 dark:text-blue-300"
                : "text-zinc-800 dark:text-zinc-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

interface ItemEditorProps {
  item: ItineraryItem;
  onSubmit: (patch: {
    startTime: string | null;
    endTime: string | null;
    notes: string | null;
  }) => void;
  onCancel: () => void;
}

function ItemEditor({ item, onSubmit, onCancel }: ItemEditorProps) {
  const [startTime, setStartTime] = React.useState(item.startTime ?? "");
  const [endTime, setEndTime] = React.useState(item.endTime ?? "");
  const [notes, setNotes] = React.useState(item.notes ?? "");

  const categoryColor =
    CATEGORY_COLORS[item.placeCategory] ||
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

  const timeError =
    startTime && endTime && endTime < startTime
      ? "Start time must be earlier than end time."
      : null;

  const handleSubmit = () => {
    if (timeError) return;
    onSubmit({
      startTime: startTime.trim() === "" ? null : startTime,
      endTime: endTime.trim() === "" ? null : endTime,
      notes: notes.trim() === "" ? null : notes.trim(),
    });
  };

  const inputClassName =
    "mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-400";

  return (
    <div className="px-4 py-4" role="group" aria-label={`Edit ${item.placeName}`}>
      <div className="flex items-center gap-3">
        {item.placeImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.placeImageUrl}
            alt={item.placeName}
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-lg dark:bg-zinc-800">
            📍
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-zinc-900 dark:text-white">
            {item.placeName}
          </p>
          <span
            className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryColor}`}
          >
            {item.placeCategory}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Start time
          </span>
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className={inputClassName}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            End time
          </span>
          <input
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className={inputClassName}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Notes
        </span>
        <textarea
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
          placeholder="Optional notes for this stop"
          className={`${inputClassName} resize-none`}
        />
        <span className="mt-0.5 block text-right text-[10px] text-zinc-400 dark:text-zinc-500">
          {notes.length}/500
        </span>
      </label>

      {timeError && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          {timeError}
        </p>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!!timeError}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function TripItinerary({ trip, places, placesLoading }: TripItineraryProps) {
  const { user } = useAuth();

  const [state, dispatch] = useReducer(tripItineraryReducer, initialState);
  const { days, daysLoading, items, itemsLoading, addDayId, addingPlaceId, editingItemId, notice } = state;

  const [plannerOpen, setPlannerOpen] = useState(false);

  const requestVersion = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const showNotice = useCallback((kind: "success" | "error", text: string) => {
    dispatch({ type: "notice", notice: { kind, text } });
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = setTimeout(
      () => dispatch({ type: "notice-cleared" }),
      NOTICE_MS
    );
  }, []);

  const loadItinerary = useCallback(async () => {
    if (!user) return;
    const version = ++requestVersion.current;
    try {
      await createTripDays(user.id, trip.id);
      const [loadedDays, loadedItems] = await Promise.all([
        getTripDays(user.id, trip.id),
        getItineraryItems(user.id, trip.id),
      ]);
      if (version === requestVersion.current) {
        dispatch({ type: "days-loaded", days: loadedDays });
        dispatch({ type: "items-loaded", items: loadedItems });
      }
    } catch (error) {
      if (version === requestVersion.current) {
        dispatch({
          type: "days-failed",
          error: error instanceof Error ? error.message : "Could not load this trip's itinerary",
        });
      }
    }
  }, [user, trip.id]);

  useEffect(() => {
    void loadItinerary();
  }, [loadItinerary]);

  const itemsByDayId = useMemo(() => {
    const map = new Map<string, ItineraryItem[]>();
    for (const day of days) {
      map.set(
        day.id,
        orderItineraryItems(items.filter((i) => i.tripDayId === day.id))
      );
    }
    return map;
  }, [days, items]);

  const [assignTargetByPlace, setAssignTargetByPlace] = useState<
    Record<string, string>
  >({});

  const plan = useMemo(() => {
    if (daysLoading || itemsLoading) return null;
    return buildTripPlan({ trip, days, places, items });
  }, [trip, days, places, items, daysLoading, itemsLoading]);

  const planReport = useMemo(
    () => (plan ? analyzeTripPlan(plan) : null),
    [plan]
  );

  const reportContext = useMemo(() => {
    const placeNameById = new Map<string, string>();
    const itemById = new Map<string, ItineraryItem>();
    for (const item of items) {
      itemById.set(item.id, item);
      if (!placeNameById.has(item.placeId)) {
        placeNameById.set(item.placeId, item.placeName);
      }
    }
    for (const place of places) {
      if (!placeNameById.has(place.placeId)) {
        placeNameById.set(place.placeId, place.placeName);
      }
    }
    return { placeNameById, itemById };
  }, [items, places]);

  const issueCounts = useMemo(
    () => countIssuesBySeverity(planReport?.issues ?? []),
    [planReport]
  );

  const healthGroups = useMemo(
    () => groupIssuesBySeverity(planReport?.issues ?? []),
    [planReport]
  );

  const readiness = useMemo(
    () =>
      daysLoading || itemsLoading
        ? null
        : computeTripReadiness({ trip, days, places, items }),
    [trip, days, places, items, daysLoading, itemsLoading]
  );

  const smartSuggestions = useMemo(
    () =>
      daysLoading || itemsLoading
        ? []
        : computeSmartDaySuggestions({ trip, days, places, items }).suggestions,
    [trip, days, places, items, daysLoading, itemsLoading]
  );

  const [applyingSuggestion, setApplyingSuggestion] = useState<string | null>(
    null
  );

  const unassignedPlaces = useMemo(
    () => unassignedTripPlaces(places, items),
    [places, items]
  );

  const handleTogglePicker = (dayId: string) => {
    dispatch(addDayId === dayId ? { type: "picker-close" } : { type: "picker-open", dayId });
  };

  const handleAddPlace = async (dayId: string, place: TripPlace) => {
    if (!user || addingPlaceId) return;

    dispatch({ type: "adding-start", placeId: place.placeId });
    try {
      const item = await addPlaceToItinerary(user.id, {
        tripId: trip.id,
        tripDayId: dayId,
        placeId: place.placeId,
      });
      dispatch({ type: "item-added", item });
      showNotice("success", `Added "${place.placeName}" to the itinerary`);
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error ? error.message : "Could not add this place to the itinerary"
      );
    } finally {
      dispatch({ type: "adding-end" });
    }
  };

  const handleAssignUnassigned = async (place: TripPlace, dayId: string) => {
    if (!user || addingPlaceId || !dayId) return;

    dispatch({ type: "adding-start", placeId: place.placeId });
    try {
      const item = await addPlaceToItinerary(user.id, {
        tripId: trip.id,
        tripDayId: dayId,
        placeId: place.placeId,
      });
      dispatch({ type: "item-added", item });
      setAssignTargetByPlace((prev) => {
        const next = { ...prev };
        delete next[place.placeId];
        return next;
      });
      const dayNumber = days.find((d) => d.id === dayId)?.dayNumber;
      showNotice(
        "success",
        `Added "${place.placeName}" to Day ${dayNumber ?? ""}`
      );
    } catch (error) {
      showNotice(
        "error",
        error instanceof Error
          ? error.message
          : "Could not add this place to a day"
      );
    } finally {
      dispatch({ type: "adding-end" });
    }
  };

  const handleRemoveItem = async (dayId: string, item: ItineraryItem) => {
    if (!user) return;

    dispatch({ type: "item-removed", itemId: item.id });

    try {
      await removeItineraryItem(user.id, {
        tripId: trip.id,
        tripDayId: dayId,
        itemId: item.id,
      });
    } catch (error) {
      dispatch({ type: "item-restored", item });
      showNotice(
        "error",
        error instanceof Error ? error.message : "Could not remove this place from the itinerary"
      );
    }
  };

  const handleEditStart = (itemId: string) => {
    dispatch({ type: "edit-start", itemId });
  };

  const handleSaveItem = async (
    dayId: string,
    item: ItineraryItem,
    patch: { startTime: string | null; endTime: string | null; notes: string | null }
  ) => {
    if (!user) return;

    const previous = items.find((i) => i.id === item.id);

    // Optimistic update, then reconcile with the server result.
    dispatch({
      type: "item-updated",
      item: { ...item, startTime: patch.startTime, endTime: patch.endTime, notes: patch.notes },
    });
    dispatch({ type: "edit-cancel" });

    try {
      const updated = await updateItineraryItem(user.id, {
        tripId: trip.id,
        tripDayId: dayId,
        itemId: item.id,
        startTime: patch.startTime,
        endTime: patch.endTime,
        notes: patch.notes,
      });
      dispatch({ type: "item-updated", item: updated });
      showNotice("success", "Itinerary details saved");
    } catch (error) {
      if (previous) {
        dispatch({ type: "item-updated", item: previous });
      }
      showNotice(
        "error",
        error instanceof Error ? error.message : "Could not save the itinerary details"
      );
    }
  };

  const handleSetItemTime = async (
    dayId: string,
    item: ItineraryItem,
    startTime: string | null
  ) => {
    if (!user) return;

    if (item.endTime && startTime && startTime > item.endTime) {
      showNotice("error", "Start time must be earlier than end time.");
      return;
    }

    const previous = items.find((i) => i.id === item.id);

    // Optimistic update, then reconcile with the server result.
    dispatch({ type: "item-updated", item: { ...item, startTime } });

    try {
      const updated = await updateItineraryItem(user.id, {
        tripId: trip.id,
        tripDayId: dayId,
        itemId: item.id,
        startTime,
      });
      dispatch({ type: "item-updated", item: updated });
    } catch (error) {
      if (previous) {
        dispatch({ type: "item-updated", item: previous });
      }
      showNotice(
        "error",
        error instanceof Error ? error.message : "Could not update the stop time"
      );
    }
  };

  const handleMoveItemToDay = async (
    sourceDayId: string,
    item: ItineraryItem,
    toDayId: string
  ) => {
    if (!user || toDayId === sourceDayId) return;

    const targetDay = days.find((d) => d.id === toDayId);
    const targetItems = itemsByDayId.get(toDayId) ?? [];

    if (targetItems.some((i) => i.placeId === item.placeId)) {
      showNotice(
        "error",
        `${item.placeName} is already assigned to Day ${targetDay?.dayNumber ?? ""}.`
      );
      return;
    }

    const previous = items.find((i) => i.id === item.id);

    // Optimistic move: point the item at its target day and append to its end.
    // Both day lists re-sort through the existing chronological ordering.
    dispatch({
      type: "item-updated",
      item: { ...item, tripDayId: toDayId, sortOrder: targetItems.length },
    });

    try {
      const updated = await moveItineraryItem(user.id, {
        tripId: trip.id,
        itemId: item.id,
        toTripDayId: toDayId,
      });
      dispatch({ type: "item-updated", item: updated });
    } catch (error) {
      if (previous) {
        dispatch({ type: "item-updated", item: previous });
      }
      showNotice(
        "error",
        error instanceof Error ? error.message : "Could not move this stop"
      );
    }
  };

  const handleApplySuggestion = async (suggestion: SmartDaySuggestion) => {
    if (!user || applyingSuggestion) return;
    const key = `${suggestion.kind}:${suggestion.placeId}`;
    setApplyingSuggestion(key);
    try {
      if (suggestion.action.type === "assign-place") {
        const place = places.find((p) => p.placeId === suggestion.action.placeId);
        const targetDay = days.find((d) => d.id === suggestion.action.targetDayId);
        if (!place || !targetDay) {
          showNotice("error", "This place or day is no longer available.");
          return;
        }
        await handleAddPlace(targetDay.id, place);
      } else {
        const item = items.find((i) => i.id === suggestion.action.itemId);
        const sourceDay = days.find((d) => d.id === suggestion.sourceDay?.id);
        const targetDay = days.find((d) => d.id === suggestion.action.targetDayId);
        if (!item || !sourceDay || !targetDay) {
          showNotice("error", "This stop or day is no longer available.");
          return;
        }
        await handleMoveItemToDay(sourceDay.id, item, targetDay.id);
      }
    } finally {
      setApplyingSuggestion(null);
    }
  };

  const handleMoveItem = async (dayId: string, itemId: string, direction: -1 | 1) => {
    if (!user) return;

    const dayItems = itemsByDayId.get(dayId) ?? [];
    const index = dayItems.findIndex((i) => i.id === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= dayItems.length) return;

    const previousItems = items;
    const optimistic = swapSortOrders(
      items,
      dayId,
      dayItems[index].id,
      dayItems[target].id
    );
    dispatch({ type: "items-reordered", items: optimistic });

    try {
      const reorderedIds = dayItems.map((i) => i.id);
      [reorderedIds[index], reorderedIds[target]] = [reorderedIds[target], reorderedIds[index]];
      const result = await reorderItineraryItems(user.id, trip.id, dayId, reorderedIds);
      dispatch({ type: "items-reordered", items: result });
    } catch (error) {
      dispatch({ type: "items-reordered", items: previousItems });
      showNotice(
        "error",
        error instanceof Error ? error.message : "Could not reorder the itinerary"
      );
    }
  };

  const {
    placeNameById,
    itemById,
  } = reportContext;

  return (
    <>
      {readiness && <TripReadinessCard summary={readiness} />}
      <section
        className="mt-8 rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        aria-labelledby="itinerary-heading"
      >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <h2 id="itinerary-heading" className="text-xl font-bold text-zinc-900 dark:text-white">
          Your itinerary
        </h2>
        {!daysLoading && days.length > 0 && (
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
            {days.length} day{days.length === 1 ? "" : "s"}
          </span>
        )}
        <button
          type="button"
          onClick={() => setPlannerOpen(true)}
          disabled={placesLoading || daysLoading || itemsLoading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.5 3.5l1.1 3.1 3.1 1.1-3.1 1.1-1.1 3.1-1.1-3.1-3.1-1.1 3.1-1.1 1.1-3.1zM8 3l.9 2.6L11.5 6.5l-2.6.9L8 10l-.9-2.6-2.6-.9 2.6-.9L8 3zm7 11.5l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1z" />
          </svg>
          AI plan my trip
        </button>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Plan each day by assigning places already in this trip.
      </p>

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-4 rounded-xl border px-4 py-2.5 text-xs font-semibold animate-fadeIn ${
            notice.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      {plan && planReport && (planReport.summary.totalDays > 0 || plan.places.length > 0) && (
        <section
          className="mt-6 rounded-2xl border border-zinc-200/90 bg-zinc-50/60 p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950/30"
          aria-labelledby="plan-summary-heading"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3
              id="plan-summary-heading"
              className="text-sm font-bold text-zinc-900 dark:text-white"
            >
              Plan summary
            </h3>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryStat label="Days" value={`${planReport.summary.totalDays}`} />
            <SummaryStat label="Planned" value={`${planReport.summary.plannedDays}`} />
            <SummaryStat label="Stops" value={`${planReport.summary.totalItems}`} />
            <SummaryStat label="Empty days" value={`${planReport.summary.emptyDays}`} />
            <SummaryStat
              label="Scheduled"
              value={`${plan.places.length - planReport.summary.unassignedPlaceCount}`}
            />
            <SummaryStat
              label="Unassigned"
              value={`${planReport.summary.unassignedPlaceCount}`}
            />
            <SummaryStat
              label="Errors"
              value={issueCounts.errors > 0 ? `${issueCounts.errors}` : "None"}
              tone={issueCounts.errors > 0 ? "error" : "neutral"}
            />
            <SummaryStat
              label="Warnings"
              value={issueCounts.warnings > 0 ? `${issueCounts.warnings}` : "None"}
              tone={issueCounts.warnings > 0 ? "warn" : "neutral"}
            />
            <SummaryStat
              label="Info"
              value={issueCounts.info > 0 ? `${issueCounts.info}` : "None"}
              tone={issueCounts.info > 0 ? "info" : "neutral"}
            />
          </div>
        </section>
      )}

      {plan && planReport && (planReport.summary.totalDays > 0 || plan.places.length > 0) && (
        <section
          className="mt-6 rounded-2xl border border-zinc-200/90 bg-zinc-50/60 p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950/30"
          aria-labelledby="itinerary-health-heading"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-7.618 1.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3
              id="itinerary-health-heading"
              className="text-sm font-bold text-zinc-900 dark:text-white"
            >
              Itinerary health
            </h3>
            {issueCounts.total > 0 && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {issueCounts.total} {issueCounts.total === 1 ? "issue" : "issues"}
              </span>
            )}
          </div>

          {healthGroups.length === 0 ? (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              No issues — itinerary looks good.
            </p>
          ) : (
            <ul className="mt-3 space-y-4">
              {healthGroups.map((group) => (
                <li key={group.severity}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${SEVERITY_BADGE[group.severity]}`}
                    >
                      {SEVERITY_META[group.severity].label}
                    </span>
                    <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                      {group.issues.length}{" "}
                      {group.issues.length === 1 ? "issue" : "issues"}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {group.issues.map((issue, index) => {
                      const dayLabel = formatIssueDay(issue);
                      const placeName = resolveIssuePlaceName(
                        issue,
                        placeNameById,
                        itemById
                      );
                      return (
                        <li
                          key={index}
                          className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[group.severity]}`}
                          />
                          <p className="min-w-0 flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                            {issue.message}
                          </p>
                          {dayLabel && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              {dayLabel}
                            </span>
                          )}
                          {placeName && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                              {placeName}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {smartSuggestions.length > 0 && (
        <SmartDaySuggestionsCard
          suggestions={smartSuggestions}
          onApply={(suggestion: SmartDaySuggestion) =>
            void handleApplySuggestion(suggestion)
          }
          applyingKey={applyingSuggestion}
        />
      )}

      {daysLoading || itemsLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800"
            />
          ))}
        </div>
      ) : days.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-200 p-8 text-center dark:border-zinc-800 animate-fadeIn">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-xl text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
            🗓️
          </div>
          <h3 className="mt-3 text-base font-bold text-zinc-900 dark:text-white">
            No itinerary days yet
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            Set this trip&apos;s start and end dates and days will appear here automatically.
          </p>
        </div>
      ) : (
        <>
        <div className="mt-6 space-y-4">
          {days.map((day) => {
            const dayItems = itemsByDayId.get(day.id) ?? [];
            const assignedPlaceIds = new Set(dayItems.map((i) => i.placeId));
            const pickablePlaces = places.filter((p) => !assignedPlaceIds.has(p.placeId));
            const isPickerOpen = addDayId === day.id;

            return (
              <div
                key={day.id}
                className="overflow-hidden rounded-2xl border border-zinc-200/90 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 px-4 py-3 dark:bg-zinc-950/40">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-2 py-1 text-xs font-bold text-white">
                      Day {day.dayNumber}
                    </span>
                    {day.date && (
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        {formatTripDate(day.date)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dayItems.length > 0 && (
                      <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                        {dayItems.length} {dayItems.length === 1 ? "stop" : "stops"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleTogglePicker(day.id)}
                      disabled={placesLoading || pickablePlaces.length === 0}
                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Add place
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {dayItems.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No activities planned yet.
                    </p>
                  ) : (
                    dayItems.map((item, index) =>
                      editingItemId === item.id ? (
                        <ItemEditor
                          key={item.id}
                          item={item}
                          onCancel={() => dispatch({ type: "edit-cancel" })}
                          onSubmit={(patch) => void handleSaveItem(day.id, item, patch)}
                        />
                      ) : (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-4 py-3"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            {index + 1}
                          </span>

                          {item.placeImageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={item.placeImageUrl}
                              alt={item.placeName}
                              className="h-12 w-12 shrink-0 rounded-xl object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-lg dark:bg-zinc-800">
                              📍
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-zinc-900 dark:text-white">
                              {item.placeName}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  CATEGORY_COLORS[item.placeCategory] ||
                                  "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                }`}
                              >
                                {item.placeCategory}
                              </span>
                              <StopTimeControl
                                item={item}
                                onSetTime={(time) =>
                                  void handleSetItemTime(day.id, item, time)
                                }
                              />
                            </div>
                            {item.notes && (
                              <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                                {item.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            {days.length > 1 && (
                              <select
                                value=""
                                onChange={(event) => {
                                  if (event.target.value) {
                                    void handleMoveItemToDay(
                                      day.id,
                                      item,
                                      event.target.value
                                    );
                                  }
                                }}
                                aria-label={`Move ${item.placeName} to another day`}
                                className="h-7 cursor-pointer rounded-md border border-transparent bg-transparent px-1 text-xs font-semibold text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                              >
                                <option value="">
                                  Move to day
                                </option>
                                {days
                                  .filter((d) => d.id !== day.id)
                                  .map((d) => (
                                    <option
                                      key={d.id}
                                      value={d.id}
                                      className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                                    >
                                      Day {d.dayNumber}
                                      {d.date ? ` — ${formatTripDate(d.date)}` : ""}
                                    </option>
                                  ))}
                              </select>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEditStart(item.id)}
                              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                              aria-label={`Edit ${item.placeName} details`}
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMoveItem(day.id, item.id, -1)}
                              disabled={index === 0}
                              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                              aria-label={`Move ${item.placeName} up`}
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMoveItem(day.id, item.id, 1)}
                              disabled={index === dayItems.length - 1}
                              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                              aria-label={`Move ${item.placeName} down`}
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemoveItem(day.id, item)}
                              className="rounded-md p-1 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                              aria-label={`Remove ${item.placeName} from day ${day.dayNumber}`}
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    )
                  )}
                </div>

                {isPickerOpen && (
                  <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-950/30">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Assign a place from this trip to Day {day.dayNumber}
                    </p>
                    {placesLoading ? (
                      <p className="text-sm text-zinc-400">Loading trip places…</p>
                    ) : pickablePlaces.length === 0 ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Every place in this trip is already assigned to this day.
                      </p>
                    ) : (
                      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {pickablePlaces.map((place) => {
                          const categoryColor =
                            CATEGORY_COLORS[place.placeCategory] ||
                            "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
                          const busy = addingPlaceId === place.placeId;
                          return (
                            <li
                              key={place.id}
                              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                                  {place.placeName}
                                </p>
                                <span
                                  className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryColor}`}
                                >
                                  {place.placeCategory}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleAddPlace(day.id, place)}
                                disabled={busy}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-70"
                              >
                                {busy ? (
                                  <>
                                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                    Adding
                                  </>
                                ) : (
                                  <>
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add
                                  </>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {unassignedPlaces.length > 0 && (
          <section
            className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/40 p-4 sm:p-5 dark:border-zinc-700 dark:bg-zinc-950/20"
            aria-labelledby="unassigned-heading"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3
                id="unassigned-heading"
                className="text-sm font-bold text-zinc-900 dark:text-white"
              >
                Unassigned places
              </h3>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                {unassignedPlaces.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              These places are in this trip but not scheduled on any day yet.
              Pick a day to add one.
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {unassignedPlaces.map((place) => {
                const categoryColor =
                  CATEGORY_COLORS[place.placeCategory] ||
                  "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
                const targetDayId = assignTargetByPlace[place.placeId] ?? "";
                const busy = addingPlaceId === place.placeId;
                return (
                  <li
                    key={place.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                        {place.placeName}
                      </p>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryColor}`}
                      >
                        {place.placeCategory}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <select
                        value={targetDayId}
                        onChange={(event) =>
                          setAssignTargetByPlace((prev) => ({
                            ...prev,
                            [place.placeId]: event.target.value,
                          }))
                        }
                        aria-label={`Choose a day for ${place.placeName}`}
                        className="h-9 cursor-pointer rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                      >
                        <option value="">Day…</option>
                        {days.map((d) => (
                          <option
                            key={d.id}
                            value={d.id}
                            className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                          >
                            Day {d.dayNumber}
                            {d.date ? ` — ${formatTripDate(d.date)}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAssignUnassigned(place, targetDayId)}
                        disabled={!targetDayId || busy}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? (
                          <>
                            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                            Adding
                          </>
                        ) : (
                          <>
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Add to day
                          </>
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        </>
      )}

      <ItineraryPlannerModal
        trip={trip}
        days={days}
        places={places}
        items={items}
        open={plannerOpen}
        onClose={() => setPlannerOpen(false)}
        onApplied={() => void loadItinerary()}
      />
      </section>
    </>
  );
}