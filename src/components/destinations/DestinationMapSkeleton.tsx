"use client";

import React from "react";

/** Placeholder matching DestinationMapSection map height. */
export default function DestinationMapSkeleton() {
  return (
    <div
      className="h-[240px] w-full animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80 sm:h-[300px] lg:h-[380px]"
      aria-hidden="true"
    />
  );
}
