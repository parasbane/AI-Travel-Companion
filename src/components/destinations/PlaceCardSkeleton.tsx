import React from "react";

export default function PlaceCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white p-0 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 animate-pulse">
      {/* Photo skeleton */}
      <div className="aspect-[16/10] w-full bg-zinc-200 dark:bg-zinc-800" />

      {/* Content skeleton */}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="h-5 w-2/3 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-12 rounded-md bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <div className="space-y-1.5 pt-1">
          <div className="h-3.5 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3.5 w-4/5 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <div className="flex gap-2 pt-2">
          <div className="h-5 w-14 rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-16 rounded-md bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      <div className="border-t border-zinc-100 p-4 pt-3 dark:border-zinc-800">
        <div className="h-3.5 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
