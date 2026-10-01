"use client";

import React from "react";
import type { DestinationContext as DestinationContextData } from "@/lib/destinations/destinationContext";
import type { SpecificPlaceCategory } from "@/lib/places/types";
import { useAuth } from "@/context/AuthContext";
import {
  BUDGET_PREFERENCE_OPTIONS,
  INTEREST_OPTIONS,
  TRAVEL_GROUP_OPTIONS,
} from "@/lib/places/preferenceOptions";

interface DestinationContextProps {
  context: DestinationContextData;
}

const CATEGORY_COLORS: Record<string, string> = {
  culture: "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300",
  food: "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300",
  nature: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300",
  adventure: "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300",
  relaxation: "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300",
  nightlife: "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300",
  attractions: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300",
};

function optionLabel<T extends string>(
  options: ReadonlyArray<{ id: T; label: string }>,
  id: T
): string {
  const match = options.find((option) => option.id === id);
  return match ? match.label : id;
}

function categoryLabel(category: SpecificPlaceCategory): string {
  return optionLabel(INTEREST_OPTIONS, category);
}

export default function DestinationContext({
  context,
}: DestinationContextProps) {
  const { profile } = useAuth();

  if (!context.hasCuratedContext) {
    return null;
  }

  const groupLabel = profile
    ? optionLabel(TRAVEL_GROUP_OPTIONS, profile.travel_group_preference)
    : null;
  const budgetLabel = profile
    ? optionLabel(BUDGET_PREFERENCE_OPTIONS, profile.budget_preference)
    : null;
  const travelerNote = profile
    ? context.travelerNotes[profile.travel_group_preference]
    : null;

  return (
    <section
      aria-label="Destination context"
      className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-8"
    >
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
              aria-hidden="true"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </span>
            <div>
              <h2 className="text-base font-bold text-zinc-900 sm:text-lg dark:text-white">
                Destination context
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Curated planning notes for {context.name}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Curated · static
          </span>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            About this destination
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {context.overview}
          </p>
          {context.availableCategories.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {context.availableCategories.map((category) => (
                <span
                  key={category}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    CATEGORY_COLORS[category] || "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {categoryLabel(category)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2 dark:border-zinc-800">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Good for
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {context.goodFor.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Planning tips
            </h3>
            <ul className="mt-2 space-y-1.5">
              {context.planningTips.map((tip) => (
                <li
                  key={tip}
                  className="flex gap-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400"
                >
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
                    aria-hidden="true"
                  />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-3.5 sm:p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Travel styles
            </h3>
            {groupLabel && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                {groupLabel} trip
              </span>
            )}
            {budgetLabel && (
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {budgetLabel}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {travelerNote ??
              "Set your travel style in Personalize Recommendations to see a fit note for this destination."}
          </p>
        </div>
      </div>
    </section>
  );
}