import React from "react";
import PlaceCardSkeleton from "@/components/destinations/PlaceCardSkeleton";

export default function DestinationLoading() {
  return (
    <div className="w-full min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Hero skeleton */}
      <div className="h-80 w-full bg-zinc-900/80 animate-pulse flex items-center justify-center">
        <div className="mx-auto max-w-7xl px-4 w-full">
          <div className="h-4 w-24 bg-zinc-800 rounded mb-4" />
          <div className="h-10 w-64 bg-zinc-800 rounded mb-3" />
          <div className="h-5 w-96 bg-zinc-800 rounded" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="border-b border-zinc-200 bg-white py-3 px-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl flex gap-3 overflow-x-auto">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse shrink-0" />
          ))}
        </div>
      </div>

      {/* Cards skeleton */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <PlaceCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
