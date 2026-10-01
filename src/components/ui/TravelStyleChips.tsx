"use client";

import { useState } from "react";

export interface TravelStyle {
  id: string;
  label: string;
}

/** Default travel-style chips (landing + dashboard). Includes Landmarks. */
export const TRAVEL_STYLES: TravelStyle[] = [
  { id: "culture", label: "Culture" },
  { id: "nature", label: "Nature" },
  { id: "food", label: "Food & Dining" },
  { id: "adventure", label: "Adventure" },
  { id: "relaxation", label: "Relaxation" },
  { id: "nightlife", label: "Nightlife" },
  { id: "attractions", label: "Landmarks" },
];

interface TravelStyleChipsProps {
  selectedStyles?: string[];
  onChange?: (styles: string[]) => void;
  className?: string;
  /** Override the default TRAVEL_STYLES list (e.g. shared INTEREST_OPTIONS). */
  styles?: TravelStyle[];
  variant?: "default" | "compact";
  align?: "center" | "start";
  hideHeader?: boolean;
}

export default function TravelStyleChips({
  selectedStyles: controlledSelected,
  onChange,
  className = "",
  styles = TRAVEL_STYLES,
  variant = "default",
  align = "center",
  hideHeader = false,
}: TravelStyleChipsProps) {
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const isControlled = controlledSelected !== undefined;
  const currentSelected = isControlled ? controlledSelected : internalSelected;

  const toggleStyle = (id: string) => {
    const updated = currentSelected.includes(id)
      ? currentSelected.filter((item) => item !== id)
      : [...currentSelected, id];

    if (!isControlled) {
      setInternalSelected(updated);
    }
    if (onChange) {
      onChange(updated);
    }
  };

  const chipPadding =
    variant === "compact" ? "px-3.5 py-2 min-h-10" : "px-4 py-2";

  return (
    <div className={`w-full ${className}`}>
      <div
        className={`flex flex-col gap-3 ${
          align === "start" ? "items-start" : "items-center"
        }`}
      >
        {!hideHeader && (
          <div
            className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 ${
              align === "start" ? "" : ""
            }`}
          >
            <span>Tailor by travel style</span>
            {currentSelected.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                {currentSelected.length} active
              </span>
            )}
          </div>
        )}

        <div
          className={`flex flex-wrap gap-2 sm:gap-2.5 ${
            align === "start" ? "justify-start" : "items-center justify-center"
          }`}
          role="group"
          aria-label="Travel interests"
        >
          {styles.map((style) => {
            const isSelected = currentSelected.includes(style.id);
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => toggleStyle(style.id)}
                aria-pressed={isSelected}
                className={`group relative inline-flex items-center gap-2 rounded-full ${chipPadding} text-sm font-medium transition-all duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700"
                    : "border border-zinc-200/90 bg-white/90 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-transform duration-150 ${
                    isSelected
                      ? "bg-white/25 text-white scale-100"
                      : "border border-zinc-300 dark:border-zinc-600 opacity-60 group-hover:border-zinc-400 group-hover:opacity-100"
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <svg
                      className="h-2.5 w-2.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span>{style.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
