"use client";

import type {
  TripReadinessStatus,
  TripReadinessSummary,
} from "@/components/dashboard/tripReadiness";

const STATUS_TONE: Record<
  TripReadinessStatus,
  { pill: string; bar: string; label: string }
> = {
  "getting-started": {
    pill: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    bar: "bg-zinc-400",
    label: "text-zinc-600 dark:text-zinc-300",
  },
  "in-progress": {
    pill: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    bar: "bg-blue-500",
    label: "text-blue-700 dark:text-blue-300",
  },
  "almost-ready": {
    pill: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    bar: "bg-amber-500",
    label: "text-amber-700 dark:text-amber-300",
  },
  ready: {
    pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    bar: "bg-emerald-500",
    label: "text-emerald-700 dark:text-emerald-300",
  },
};

export default function TripReadinessCard({
  summary,
}: {
  summary: TripReadinessSummary;
}) {
  const tone = STATUS_TONE[summary.status];
  const doneItems = summary.checklist.filter((item) => item.kind === "done");
  const todoItems = summary.checklist.filter((item) => item.kind === "todo");

  return (
    <section
      className="mt-8 rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      aria-labelledby="trip-readiness-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <h2
          id="trip-readiness-heading"
          className="text-xl font-bold text-zinc-900 dark:text-white"
        >
          Trip readiness
        </h2>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${tone.pill}`}
        >
          {summary.statusLabel}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="text-zinc-500 dark:text-zinc-400">
          Preparation progress
        </span>
        <span className={`tabular-nums ${tone.label}`}>{summary.score}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={summary.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Trip preparation progress"
        className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
      >
        <div
          className={`h-full rounded-full ${tone.bar}`}
          style={{ width: `${summary.score}%` }}
        />
      </div>

      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
        {summary.conciseSummary}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            What&apos;s ready
          </h3>
          <ul className="mt-2 space-y-1.5">
            {doneItems.length === 0 ? (
              <li className="text-sm text-zinc-400 dark:text-zinc-500">
                Nothing yet — keep adding to this trip.
              </li>
            ) : (
              doneItems.map((item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-emerald-500">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item.label}
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Needs attention
          </h3>
          <ul className="mt-2 space-y-1.5">
            {todoItems.length === 0 ? (
              <li className="text-sm text-zinc-600 dark:text-zinc-300">
                Everything planned from the data in the app — nothing left to add.
              </li>
            ) : (
              todoItems.map((item, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                    <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </span>
                  {item.label}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}