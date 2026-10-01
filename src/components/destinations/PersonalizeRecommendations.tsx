"use client";

import React from "react";

interface PersonalizeRecommendationsProps {
  isActive: boolean;
  source?: "session" | "profile" | null;
  sortIsRecommended: boolean;
  onOpen: () => void;
  onClearSession?: () => void;
}

export default function PersonalizeRecommendations({
  isActive,
  source = null,
  sortIsRecommended,
  onOpen,
  onClearSession,
}: PersonalizeRecommendationsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          isActive
            ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
            : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        }`}
      >
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
        Personalize Recommendations
      </button>

      {isActive && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden="true" />
          {source === "session"
            ? "Personalized"
            : source === "profile"
              ? "Using profile preferences"
              : "Personalized"}
          {!sortIsRecommended && (
            <span className="font-medium text-blue-700/80 dark:text-blue-300/80">
              · switch to Recommended
            </span>
          )}
          {source === "session" && onClearSession && (
            <button
              type="button"
              onClick={onClearSession}
              className="ml-0.5 rounded-full px-1 text-blue-700 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-200 dark:hover:bg-blue-900/50"
              aria-label="Clear session personalization"
            >
              ×
            </button>
          )}
        </span>
      )}
    </div>
  );
}
