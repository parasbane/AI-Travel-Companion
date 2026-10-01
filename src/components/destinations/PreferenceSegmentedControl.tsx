"use client";

import React from "react";

interface PreferenceSegmentedControlProps<T extends string> {
  label: string;
  name: string;
  options: { id: T; label: string; description?: string }[];
  value?: T;
  onChange: (value: T | undefined) => void;
  allowDeselect?: boolean;
  className?: string;
}

export default function PreferenceSegmentedControl<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  allowDeselect = true,
  className = "",
}: PreferenceSegmentedControlProps<T>) {
  return (
    <fieldset className={className}>
      <legend className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {label}
      </legend>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-2.5 flex flex-wrap gap-2"
      >
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              name={name}
              onClick={() => {
                if (selected && allowDeselect) {
                  onChange(undefined);
                } else {
                  onChange(option.id);
                }
              }}
              className={`min-h-10 inline-flex flex-col items-start justify-center rounded-xl px-3.5 py-2 text-left text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                selected
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                  : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{option.label}</span>
              {option.description && (
                <span
                  className={`mt-0.5 text-[11px] font-normal leading-tight ${
                    selected ? "text-blue-100" : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {option.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
