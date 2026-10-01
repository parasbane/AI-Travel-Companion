"use client";

import React from "react";
import type { PlaceCategory } from "@/lib/places/types";

interface CategoryTabsProps {
  selectedCategory: PlaceCategory;
  onSelectCategory: (category: PlaceCategory) => void;
  categoryCounts?: Record<string, number>;
}

const CATEGORIES: { id: PlaceCategory; label: string; icon: string }[] = [
  { id: "all", label: "All Highlights", icon: "✨" },
  { id: "attractions", label: "Landmarks", icon: "🏛️" },
  { id: "culture", label: "Culture", icon: "🎨" },
  { id: "food", label: "Food & Dining", icon: "🍜" },
  { id: "nature", label: "Nature", icon: "🌿" },
  { id: "adventure", label: "Adventure", icon: "🧗" },
  { id: "relaxation", label: "Relaxation", icon: "🏖️" },
  { id: "nightlife", label: "Nightlife", icon: "🍸" },
];

export default function CategoryTabs({
  selectedCategory,
  onSelectCategory,
  categoryCounts = {},
}: CategoryTabsProps) {
  return (
    <div className="w-full border-b border-zinc-200 bg-white/90 backdrop-blur-md sticky top-16 z-30 dark:border-zinc-800 dark:bg-zinc-950/90 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          role="tablist"
          aria-label="Place categories"
          className="flex items-center gap-1.5 overflow-x-auto py-3 no-scrollbar"
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const count = categoryCounts[cat.id];

            return (
              <button
                key={cat.id}
                role="tab"
                type="button"
                aria-selected={isSelected}
                onClick={() => onSelectCategory(cat.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-white"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                {count !== undefined && count > 0 && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isSelected
                        ? "bg-white/25 text-white"
                        : "bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
