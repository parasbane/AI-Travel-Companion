"use client";

import React from "react";
import Link from "next/link";
import type { DestinationInfo } from "@/lib/places/types";
import SearchBar from "@/components/ui/SearchBar";
import { useRouter } from "next/navigation";
import { formatDestinationSlug } from "@/lib/utils/slug";

interface DestinationHeroProps {
  destination: DestinationInfo;
}

export default function DestinationHero({ destination }: DestinationHeroProps) {
  const router = useRouter();

  const handleDestinationChange = (newDest: string) => {
    const slug = formatDestinationSlug(newDest);
    if (slug) {
      router.push(`/destinations/${slug}`);
    }
  };

  return (
    <div className="relative w-full overflow-hidden border-b border-zinc-200 bg-zinc-900 text-white dark:border-zinc-800">
      {/* Background Image with Dark Vignette & Gradient */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-luminosity transform scale-105 transition-transform duration-700 hover:scale-100"
        style={{ backgroundImage: `url(${destination.heroImageUrl})` }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-900/40" />

      {/* Hero Content */}
      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {/* Back breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs font-medium text-zinc-400">
          <Link
            href="/"
            className="hover:text-white transition-colors flex items-center gap-1"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Home
          </Link>
          <span>/</span>
          <span>Destinations</span>
          <span>/</span>
          <span className="text-white font-semibold">{destination.name}</span>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div className="max-w-2xl">
            {/* Country and Best Time Badge */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-full bg-blue-600/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {destination.country}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-zinc-200 backdrop-blur-sm">
                <svg
                  className="h-3.5 w-3.5 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                {destination.bestTimeToVisit}
              </span>
            </div>

            {/* Destination Name */}
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {destination.name}
            </h1>

            {/* Description */}
            <p className="mt-3 text-base sm:text-lg text-zinc-300 leading-relaxed">
              {destination.description}
            </p>
          </div>

          {/* Quick Destination Switcher */}
          <div className="w-full lg:max-w-xs shrink-0">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
              Explore another destination
            </label>
            <SearchBar
              placeholder="e.g., Paris, Tokyo, Bali..."
              onSearch={handleDestinationChange}
              className="shadow-2xl"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
