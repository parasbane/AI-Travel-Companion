"use client";

import type { SmartDaySuggestion } from "@/components/dashboard/smartDaySuggestions";

export default function SmartDaySuggestions({
  suggestions,
  onApply,
  applyingKey,
}: {
  suggestions: SmartDaySuggestion[];
  onApply: (suggestion: SmartDaySuggestion) => void;
  applyingKey: string | null;
}) {
  return (
    <section
      className="mt-6 rounded-2xl border border-zinc-200/90 bg-zinc-50/60 p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950/30"
      aria-labelledby="smart-day-suggestions-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3
          id="smart-day-suggestions-heading"
          className="text-sm font-bold text-zinc-900 dark:text-white"
        >
          Smart day suggestions
        </h3>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {suggestions.length} {suggestions.length === 1 ? "idea" : "ideas"}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Ways to spread the places already in this trip across your days. These
        are suggestions only — nothing changes until you apply one.
      </p>

      <ul className="mt-3 space-y-2">
        {suggestions.map((suggestion) => {
          const key = `${suggestion.kind}:${suggestion.placeId}`;
          const isApplying = applyingKey === key;
          const isMove = suggestion.kind === "rebalance";
          return (
            <li
              key={key}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  isMove
                    ? "bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400"
                    : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                }`}
                aria-hidden="true"
              >
                {isMove ? "→" : "+"}
              </span>
              <p className="min-w-0 flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {suggestion.reason}
              </p>
              <span className="flex flex-wrap items-center gap-1">
                {suggestion.sourceDay && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {suggestion.sourceDay.dayNumber}
                  </span>
                )}
                {suggestion.sourceDay && (
                  <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500">
                    →
                  </span>
                )}
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  Day {suggestion.targetDay?.dayNumber ?? "?"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onApply(suggestion)}
                disabled={isApplying}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70 ${
                  isMove
                    ? "bg-orange-600 text-white hover:bg-orange-700"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {isApplying ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    {isMove ? "Moving" : "Adding"}
                  </>
                ) : (
                  isMove ? "Move" : "Add to day"
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}