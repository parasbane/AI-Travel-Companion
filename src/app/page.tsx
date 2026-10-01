"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SearchBar from "@/components/ui/SearchBar";
import TravelStyleChips from "@/components/ui/TravelStyleChips";
import HowItWorks from "@/components/sections/HowItWorks";
import FeatureHighlights from "@/components/sections/FeatureHighlights";
import { formatDestinationSlug } from "@/lib/utils/slug";

export default function Home() {
  const router = useRouter();
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);

  const handleExplore = (destination: string) => {
    const slug = formatDestinationSlug(destination);
    if (!slug) return;
    const params = new URLSearchParams();
    if (selectedStyles.length > 0) {
      params.set("styles", selectedStyles.join(","));
    }
    const queryStr = params.toString();
    router.push(`/destinations/${slug}${queryStr ? `?${queryStr}` : ""}`);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen" style={{ backgroundColor: '#F3F6FA' }}>
      {/* Hero Section */}
      <section
        id="explore"
        className="relative w-full overflow-hidden px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28 lg:px-8 text-center"
      >
        {/* Soft, elegant ambient background glow */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-32 -z-10 flex transform-gpu justify-center overflow-hidden blur-3xl"
          aria-hidden="true"
        >
          <div
            className="aspect-[1150/600] w-[70rem] flex-none bg-gradient-to-tr from-blue-500/15 via-indigo-500/10 to-teal-400/15 opacity-60 dark:opacity-25"
            style={{
              clipPath:
                "polygon(50% 0%, 82% 12%, 100% 38%, 85% 72%, 52% 100%, 18% 85%, 0% 50%, 15% 15%)",
            }}
          />
        </div>

        <div className="mx-auto max-w-4xl flex flex-col items-center">
          {/* Subtle Category Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/90 bg-blue-50/80 px-3.5 py-1 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur-sm dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
            Smarter Travel Discovery
          </div>

          {/* 1. Main Hero Headline: Largest & Strongest Text */}
          <h1 className="mt-6 text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-[1.08]">
            AI Travel Companion
          </h1>

          {/* 2. Smaller Supporting Tagline directly below headline */}
          <p className="mt-4 text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
            Personalized travel recommendations, crafted by AI.
          </p>

          {/* 3. Short Supporting Description */}
          <p className="mt-4 max-w-2xl text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed font-normal">
            Discover places that match your interests, budget, travel style, and
            time — instead of settling for generic travel lists.
          </p>

          {/* 4. Destination Search + Explore (Primary CTA) */}
          <div className="mt-10 w-full flex justify-center">
            <SearchBar onSearch={handleExplore} />
          </div>

          {/* 5. Travel Style Selection */}
          <div className="mt-7 w-full max-w-2xl">
            <TravelStyleChips
              selectedStyles={selectedStyles}
              onChange={setSelectedStyles}
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <HowItWorks />

      {/* Feature Highlights Section */}
      <FeatureHighlights />

      {/* About & Final Call-to-Action Section */}
      <section
        id="about"
        className="w-full px-4 py-20 sm:px-6 sm:py-28 lg:px-8 text-center"
      >
        <div className="mx-auto max-w-3xl rounded-3xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/70 p-8 sm:p-14 shadow-xl shadow-zinc-900/5 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950/70 dark:shadow-black/20">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
            Portfolio Demo
          </div>
          <h3 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
            Ready to Experience Personalized Travel?
          </h3>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto leading-relaxed">
            AI Travel Companion is built to transform how travelers discover, plan,
            and explore. Start your next journey with recommendations tailored to you.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#explore"
              className="w-full sm:w-auto rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Start Exploring
            </a>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto rounded-xl border border-zinc-300 px-7 py-3.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
