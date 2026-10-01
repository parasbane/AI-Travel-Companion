"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { hasPersonalizationPrefs } from "@/lib/places/scoring";
import type { RecommendationPreferences } from "@/lib/places/types";
import {
  MAX_INSTRUCTION_LENGTH,
  planItinerary,
} from "@/lib/ai/itineraryPlanner";
import type { ItineraryProposal } from "@/lib/ai/itineraryPlanner";
import { formatTripDate } from "@/lib/saved/tripDates";
import type {
  ItineraryItem,
  Trip,
  TripDay,
  TripPlace,
} from "@/lib/saved/types";
import type { UserProfile } from "@/lib/types/auth";

function profilePreferences(
  profile: UserProfile | null | undefined
): RecommendationPreferences | null {
  if (!profile) return null;
  const prefs: RecommendationPreferences = {};
  if (Array.isArray(profile.travel_styles) && profile.travel_styles.length > 0) {
    prefs.styles = [...profile.travel_styles];
  }
  if (profile.budget_preference) prefs.budget = profile.budget_preference;
  if (profile.travel_group_preference) prefs.group = profile.travel_group_preference;
  return hasPersonalizationPrefs(prefs) ? prefs : null;
}

interface ItineraryPlannerModalProps {
  trip: Trip;
  days: TripDay[];
  places: TripPlace[];
  items: ItineraryItem[];
  open: boolean;
  onClose: () => void;
  /** Called after a plan is successfully persisted so the itinerary can reload. */
  onApplied?: () => void;
}

type ProposalSource = "server" | "device";

export default function ItineraryPlannerModal({
  trip,
  days,
  places,
  items,
  open,
  onClose,
  onApplied,
}: ItineraryPlannerModalProps) {
  const { user, profile } = useAuth();

  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<ItineraryProposal | null>(null);
  const [source, setSource] = useState<ProposalSource | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  const preferences = useMemo(() => profilePreferences(profile), [profile]);

  const placeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const place of places) map.set(place.placeId, place.placeName);
    return map;
  }, [places]);

  // Reset the dialog whenever it transitions to open.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setInstruction("");
      setProposal(null);
      setSource(null);
      setError(null);
      setAppliedNotice(null);
      setIsApplying(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const placeName = (placeId: string) => placeNameById.get(placeId) ?? placeId;

  const computeLocally = () => {
    try {
      setProposal(
        planItinerary({
          trip,
          days,
          places,
          items,
          preferences,
          instruction,
        })
      );
      setSource("device");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not generate a plan.");
    }
  };

  const generate = async () => {
    if (isPlanning || !user) return;
    setError(null);
    setAppliedNotice(null);
    setProposal(null);
    setSource(null);
    setIsPlanning(true);

    try {
      const response = await fetch("/api/ai/itinerary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          tripId: trip.id,
          instruction,
          preferences,
        }),
      });
      const payload = await response.json();

      if (response.ok && payload.ok) {
        setProposal(payload.data.proposal);
        setSource("server");
        return;
      }

      // The server trip context lives in Supabase; in on-device/demo mode the
      // server has no access to the client's trip, so compute the identical
      // deterministic result locally rather than leaving the button broken.
      computeLocally();
    } catch {
      computeLocally();
    } finally {
      setIsPlanning(false);
    }
  };

  const handleUsePlan = async () => {
    if (!user || !proposal || isApplying) return;

    // Plans computed on-device cannot be persisted to the server in demo mode.
    // Stay honest: nothing was written, so suggest the existing manual paths.
    if (source !== "server") {
      setAppliedNotice(
        "This plan was computed on-device and can't be persisted in demo mode, so nothing was changed. Add each suggested stop using the day's \u201cAdd place\u201d picker or the \u201cUnassigned places\u201d list."
      );
      return;
    }

    setAppliedNotice(null);
    setIsApplying(true);
    try {
      const response = await fetch("/api/ai/itinerary/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, tripId: trip.id, proposal }),
      });
      const payload = await response.json();

      if (response.ok && payload.ok) {
        const application = payload.data.application;
        const added = application.addedStopCount;
        const parts: string[] = [];
        if (added > 0) {
          parts.push(
            `Applied ${added} suggested stop${added === 1 ? "" : "s"} across ${application.daysApplied} day${application.daysApplied === 1 ? "" : "s"}`
          );
        } else {
          parts.push("Nothing new to apply");
        }
        if (application.skippedCount > 0) {
          parts.push(
            `${application.skippedCount} already scheduled and left in place`
          );
        }
        if (application.rejectedPlaceIds.length > 0) {
          parts.push(
            `${application.rejectedPlaceIds.length} invalid place id${application.rejectedPlaceIds.length === 1 ? "" : "s"} rejected`
          );
        }
        if (application.keptUnassignedCount > 0) {
          parts.push(
            `${application.keptUnassignedCount} place${application.keptUnassignedCount === 1 ? "" : "s"} left unassigned for you to add manually`
          );
        }
        setAppliedNotice(`${parts.join(". ")}. The itinerary below was updated.`);
        onApplied?.();
      } else {
        setAppliedNotice(
          payload.error?.message ?? "Could not apply this plan. No stops were changed."
        );
      }
    } catch {
      setAppliedNotice("Could not apply this plan. No stops were changed.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-planner-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-left">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 p-6 pb-4 dark:border-zinc-800">
          <div>
            <h2
              id="ai-planner-modal-title"
              className="text-lg font-bold text-zinc-900 dark:text-white"
            >
              AI plan my trip
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Suggest a day-by-day itinerary using only the places already in {
                trip.title
              }.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            aria-label="Close itinerary planner dialog"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {days.length} day{days.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {places.length} place{places.length === 1 ? "" : "s"} in the trip
            </span>
            {preferences && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                Using your profile preferences
              </span>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
            >
              {error}
            </p>
          )}

          <div className="w-full space-y-1.5 text-left">
            <label
              htmlFor="ai-plan-instruction"
              className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200"
            >
              Instructions <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              id="ai-plan-instruction"
              rows={2}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              maxLength={MAX_INSTRUCTION_LENGTH}
              placeholder="e.g. Relaxed mornings and fewer stops each day"
              disabled={isPlanning}
              className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm sm:text-base text-zinc-900 transition-all duration-150 focus:outline-none focus-visible:border-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-600/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-indigo-400 disabled:opacity-60"
            />
            <span className="block text-right text-[10px] text-zinc-400 dark:text-zinc-500">
              {instruction.length}/{MAX_INSTRUCTION_LENGTH}
            </span>
          </div>

          {days.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/30 dark:text-zinc-400">
              This trip has no itinerary days yet. Set its start and end dates first.
            </p>
          ) : (
            !proposal &&
            places.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/30 dark:text-zinc-400">
                Add at least one place to this trip before planning.
              </p>
            )
          )}

          {proposal && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Proposed itinerary
                </h3>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {proposal.source === "deterministic" ? "Deterministic planner" : proposal.source}
                </span>
                {source === "device" && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                    Computed on-device
                  </span>
                )}
              </div>

              {proposal.instruction && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Instructions: {proposal.instruction}
                </p>
              )}

              {proposal.days.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/30 dark:text-zinc-400">
                  No itinerary days to plan. Add start/end dates to this trip.
                </p>
              ) : (
                <ol className="space-y-4">
                  {proposal.days.map((day) => (
                    <li
                      key={day.dayNumber}
                      className="overflow-hidden rounded-2xl border border-zinc-200/90 dark:border-zinc-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-50 px-4 py-2.5 dark:bg-zinc-950/40">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-2 py-1 text-xs font-bold text-white">
                            Day {day.dayNumber}
                          </span>
                          {day.calendarDate && (
                            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                              {formatTripDate(day.calendarDate)}
                            </span>
                          )}
                        </div>
                        {day.orderedPlaceIds.length > 0 && (
                          <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                            {day.orderedPlaceIds.length}{" "}
                            {day.orderedPlaceIds.length === 1 ? "stop" : "stops"}
                          </span>
                        )}
                      </div>

                      {day.orderedPlaceIds.length === 0 ? (
                        <p className="px-4 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                          No stops for this day.
                        </p>
                      ) : (
                        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                          {day.orderedPlaceIds.map((placeId) => {
                            const isScheduled = day.scheduledPlaceIds.includes(placeId);
                            return (
                              <li
                                key={placeId}
                                className="flex items-center gap-3 px-4 py-2.5"
                              >
                                <span
                                  className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-wider ${
                                    isScheduled
                                      ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                      : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                                  }`}
                                >
                                  {isScheduled ? "Kept" : "Suggested"}
                                </span>
                                <span className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                                  {placeName(placeId)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <p className="border-t border-zinc-100 px-4 py-2 text-[11px] italic text-zinc-400 dark:border-zinc-800/80 dark:text-zinc-500">
                        {day.reasoning}
                      </p>
                    </li>
                  ))}
                </ol>
              )}

              {proposal.unassignedPlaceIds.length > 0 && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  Left unassigned ({proposal.unassignedPlaceIds.length}): not enough per-day
                  room to place{" "}
                  {proposal.unassignedPlaceIds.map(placeName).join(", ")}. Add these manually
                  with the &ldquo;Unassigned places&rdquo; list.
                </p>
              )}

              {source === "device" && (
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  The server planner was unreachable (trip data lives on this device), so the
                  plan was computed here with the same deterministic planner.
                </p>
              )}

              {appliedNotice && (
                <p
                  role="status"
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300"
                >
                  {appliedNotice}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => {
              setProposal(null);
              setAppliedNotice(null);
              onClose();
            }}
            disabled={isPlanning || isApplying}
          >
            Cancel
          </Button>
          {proposal && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => void handleUsePlan()}
              disabled={isApplying}
            >
              Use this plan
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            isLoading={isPlanning}
            disabled={days.length === 0 || places.length === 0 || isApplying}
            onClick={() => void generate()}
          >
            Generate plan
          </Button>
        </div>
      </div>
    </div>
  );
}