"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import TravelStyleChips from "@/components/ui/TravelStyleChips";
import type { BudgetPreference, TravelGroupPreference } from "@/lib/types/auth";
import { Button } from "@/components/ui/Button";
import SavedPlacesSection from "@/components/dashboard/SavedPlacesSection";
import TripsSection from "@/components/dashboard/TripsSection";

const BUDGET_OPTIONS: { id: BudgetPreference; label: string; desc: string }[] = [
  { id: "budget", label: "Budget-Friendly", desc: "Smart savings & hostels" },
  { id: "balanced", label: "Balanced", desc: "Mid-tier hotels & casual dining" },
  { id: "luxury", label: "Luxury", desc: "High-end stays & fine dining" },
];

const GROUP_OPTIONS: { id: TravelGroupPreference; label: string }[] = [
  { id: "solo", label: "Solo Traveler" },
  { id: "couple", label: "Couple / Duo" },
  { id: "family", label: "Family" },
  { id: "friends", label: "Friends Group" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, isLoading, signOut, updatePreferences } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 text-sm text-zinc-500">
          <svg className="h-5 w-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading your travel dashboard...
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  const handleBudgetChange = async (budget: BudgetPreference) => {
    if (!profile) return;
    setIsSaving(true);
    await updatePreferences(profile.travel_styles, budget, profile.travel_group_preference);
    setIsSaving(false);
    triggerSaveAlert();
  };

  const handleGroupChange = async (group: TravelGroupPreference) => {
    if (!profile) return;
    setIsSaving(true);
    await updatePreferences(profile.travel_styles, profile.budget_preference, group);
    setIsSaving(false);
    triggerSaveAlert();
  };

  const handleStylesChange = async (styles: string[]) => {
    if (!profile) return;
    setIsSaving(true);
    await updatePreferences(styles, profile.budget_preference, profile.travel_group_preference);
    setIsSaving(false);
    triggerSaveAlert();
  };

  const triggerSaveAlert = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Top Welcome Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-8 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
            Authenticated Profile
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            Welcome back, {user?.name || "Traveler"}!
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {user?.email} • Member of AI Travel Companion
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            onClick={handleLogout}
            className="text-zinc-700 hover:text-rose-600 dark:text-zinc-300 dark:hover:text-rose-400"
          >
            <svg
              className="h-4 w-4 mr-1.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
              />
            </svg>
            Log Out
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <div
          role="status"
          className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs sm:text-sm font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300 animate-fadeIn"
        >
          <svg className="h-4 w-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Travel preferences saved successfully!
        </div>
      )}

      {/* Main Grid: Preferences */}
      <div className="mt-8 grid grid-cols-1 gap-8">
        {/* Travel Preferences Foundation */}
        <div className="space-y-8">
          {/* Section: Travel Styles */}
          <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                  Your Travel DNA & Styles
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Select the travel styles you enjoy to tune future AI recommendations.
                </p>
              </div>
              {isSaving && (
                <span className="text-xs text-blue-600 dark:text-blue-400 animate-pulse font-medium">
                  Saving...
                </span>
              )}
            </div>

            <div className="pt-2">
              <TravelStyleChips
                selectedStyles={profile?.travel_styles || []}
                onChange={handleStylesChange}
              />
            </div>
          </div>

          {/* Section: Budget & Group Preferences */}
          <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                Budget & Companionship Preferences
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Help AI Travel Companion estimate dining, lodging, and activity costs.
              </p>
            </div>

            {/* Budget options */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                Budget Tier
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {BUDGET_OPTIONS.map((opt) => {
                  const isSelected = (profile?.budget_preference || "balanced") === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleBudgetChange(opt.id)}
                      className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all duration-150 ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-2 ring-blue-600/20"
                          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900"
                      }`}
                    >
                      <span className="text-sm font-semibold">{opt.label}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group options */}
            <div className="pt-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                Default Group Type
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {GROUP_OPTIONS.map((opt) => {
                  const isSelected = (profile?.travel_group_preference || "solo") === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleGroupChange(opt.id)}
                      className={`px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold text-center transition-all ${
                        isSelected
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <TripsSection className="mt-8" />
      <SavedPlacesSection className="mt-8" />
    </div>
  );
}
