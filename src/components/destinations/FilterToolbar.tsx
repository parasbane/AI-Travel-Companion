"use client";

import React from "react";
import type { PriceLevel } from "@/lib/places/types";
import PersonalizeRecommendations from "./PersonalizeRecommendations";

interface FilterToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedBudget: PriceLevel | "all";
  onBudgetChange: (budget: PriceLevel | "all") => void;
  selectedSort: "recommended" | "rating" | "reviews" | "name";
  onSortChange: (sort: "recommended" | "rating" | "reviews" | "name") => void;
  totalResults: number;
  onReset?: () => void;
  personalizeActive?: boolean;
  personalizeSource?: "session" | "profile" | null;
  onOpenPersonalize?: () => void;
  onClearSessionPersonalize?: () => void;
}

export default function FilterToolbar({
  searchQuery,
  onSearchChange,
  selectedBudget,
  onBudgetChange,
  selectedSort,
  onSortChange,
  totalResults,
  onReset,
  personalizeActive = false,
  personalizeSource = null,
  onOpenPersonalize,
  onClearSessionPersonalize,
}: FilterToolbarProps) {
  const hasActiveFilters = searchQuery !== "" || selectedBudget !== "all";

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search input within destination */}
          <div className="relative flex-1 max-w-md">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400"
              aria-hidden="true"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search places, keywords, or tags..."
              className="w-full rounded-xl border border-zinc-300 bg-white pl-9 pr-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500"
              aria-label="Filter places by keyword"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                aria-label="Clear search text"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {onOpenPersonalize && (
            <PersonalizeRecommendations
              isActive={personalizeActive}
              source={personalizeSource}
              sortIsRecommended={selectedSort === "recommended"}
              onOpen={onOpenPersonalize}
              onClearSession={onClearSessionPersonalize}
            />
          )}
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Price-tier hard filter (distinct from travel-budget preference) */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="budget-select"
              className="text-xs font-semibold text-zinc-500 dark:text-zinc-400"
            >
              Price tier:
            </label>
            <select
              id="budget-select"
              value={selectedBudget}
              onChange={(e) => onBudgetChange(e.target.value as PriceLevel | "all")}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-zinc-800 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <option value="all">All Tiers</option>
              <option value="free">Free ($0)</option>
              <option value="budget">Budget ($)</option>
              <option value="moderate">Moderate ($$)</option>
              <option value="expensive">Luxury ($$$)</option>
            </select>
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="sort-select"
              className="text-xs font-semibold text-zinc-500 dark:text-zinc-400"
            >
              Sort:
            </label>
            <select
              id="sort-select"
              value={selectedSort}
              onChange={(e) =>
                onSortChange(e.target.value as "recommended" | "rating" | "reviews" | "name")
              }
              className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-zinc-800 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <option value="recommended">Recommended</option>
              <option value="rating">Top Rated (★)</option>
              <option value="reviews">Most Reviewed</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>

          {/* Reset button — filters only, not personalization */}
          {hasActiveFilters && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 ml-1"
            >
              Reset filters
            </button>
          )}

          {/* Results count badge */}
          <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 ml-auto md:ml-2">
            {totalResults} {totalResults === 1 ? "spot" : "spots"} found
          </span>
        </div>
      </div>
    </div>
  );
}
