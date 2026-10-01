"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import type {
  BudgetPreference,
  TravelGroupPreference,
} from "@/lib/places/types";
import {
  BUDGET_PREFERENCE_OPTIONS,
  INTEREST_OPTIONS,
  TRAVEL_GROUP_OPTIONS,
  TRIP_PREFERENCE_OPTIONS,
  type TripPreference,
} from "@/lib/places/preferenceOptions";
import { Button } from "@/components/ui/Button";
import PreferenceSegmentedControl from "./PreferenceSegmentedControl";
import TravelStyleChips from "@/components/ui/TravelStyleChips";

export interface PersonalizeDraft {
  styles: string[];
  budget?: BudgetPreference;
  group?: TravelGroupPreference;
  trip?: TripPreference;
}

interface PersonalizePreferencesPanelProps {
  open: boolean;
  onClose: () => void;
  initialDraft: PersonalizeDraft;
  onApply: (draft: PersonalizeDraft) => void;
  onClear: () => void;
}

export default function PersonalizePreferencesPanel({
  open,
  onClose,
  initialDraft,
  onApply,
  onClear,
}: PersonalizePreferencesPanelProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Draft is seeded on mount; parent remounts this panel each time it opens.
  const [draft, setDraft] = useState<PersonalizeDraft>(initialDraft);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const previouslyFocused = document.activeElement as HTMLElement | null;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleClear = () => {
    const empty: PersonalizeDraft = { styles: [] };
    setDraft(empty);
    onClear();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6 bg-black/55 backdrop-blur-sm animate-fadeIn"
      role="presentation"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 md:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2
              id={titleId}
              className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white"
            >
              Personalize Recommendations
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Soft preferences reorder Recommended results — nothing is hidden.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close personalization panel"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <PreferenceSegmentedControl
            label="Travel group"
            name="travel-group"
            options={TRAVEL_GROUP_OPTIONS}
            value={draft.group}
            onChange={(group) => setDraft((prev) => ({ ...prev, group }))}
          />

          <PreferenceSegmentedControl
            label="Travel budget"
            name="travel-budget"
            options={BUDGET_PREFERENCE_OPTIONS}
            value={draft.budget}
            onChange={(budget) => setDraft((prev) => ({ ...prev, budget }))}
          />

          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Interests
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Select one or more interests to boost matching places.
            </p>
            <TravelStyleChips
              selectedStyles={draft.styles}
              onChange={(styles) => setDraft((prev) => ({ ...prev, styles }))}
              styles={INTEREST_OPTIONS}
              variant="compact"
              align="start"
              hideHeader
              className="mt-3"
            />
          </div>

          <PreferenceSegmentedControl
            label="Trip timing (optional)"
            name="trip-timing"
            options={TRIP_PREFERENCE_OPTIONS}
            value={draft.trip}
            onChange={(trip) => setDraft((prev) => ({ ...prev, trip }))}
          />
          <p className="-mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Saved for your session only — does not change ranking yet.
          </p>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-zinc-100 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleClear}
            className="order-2 sm:order-1"
          >
            Clear preferences
          </Button>
          <div className="order-1 flex gap-2 sm:order-2">
            <Button type="button" variant="outline" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleApply}
              aria-label="Apply personalization preferences"
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
