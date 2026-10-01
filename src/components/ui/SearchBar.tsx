"use client";

import { useState, FormEvent } from "react";

interface SearchBarProps {
  onSearch?: (destination: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchBar({
  onSearch,
  placeholder = "Where to? e.g., Goa, Tokyo, Paris",
  className = "",
}: SearchBarProps) {
  const [destination, setDestination] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeDestination, setActiveDestination] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = destination.trim();

    if (!trimmed) {
      setErrorMessage("Please enter a destination to explore.");
      return;
    }

    setErrorMessage(null);
    setActiveDestination(trimmed);

    if (onSearch) {
      onSearch(trimmed);
    }
  };

  const handleReset = () => {
    setDestination("");
    setActiveDestination(null);
    setErrorMessage(null);
  };

  const handleInputChange = (value: string) => {
    setDestination(value);
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  return (
    <div className={`w-full max-w-2xl flex flex-col items-center gap-3 ${className}`}>
      {/* Search Input Card */}
      <form
        onSubmit={handleSubmit}
        className="group relative w-full rounded-2xl border border-zinc-200/90 bg-white p-2 shadow-xl shadow-zinc-900/5 transition-all duration-200 hover:border-zinc-300 hover:shadow-2xl hover:shadow-zinc-900/10 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/30 dark:hover:border-zinc-700"
        role="search"
        aria-label="Destination search form"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Location Icon & Input Field */}
          <div className="relative flex flex-1 items-center px-3 py-1.5">
            <span
              className="text-zinc-400 group-focus-within:text-blue-600 dark:text-zinc-500 dark:group-focus-within:text-blue-400 transition-colors shrink-0"
              aria-hidden="true"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                />
              </svg>
            </span>
            <input
              id="destination-input"
              type="text"
              value={destination}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={placeholder}
              aria-label="Where do you want to travel?"
              aria-describedby={errorMessage ? "search-error" : undefined}
              className="w-full bg-transparent pl-3 pr-2 py-2 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white dark:placeholder:text-zinc-500 font-medium"
            />
          </div>

          {/* Primary Explore Button */}
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-base font-semibold text-white shadow-md shadow-blue-600/20 transition-all duration-150 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/25 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <span>Explore</span>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </button>
        </div>
      </form>

      {/* Validation Error Feedback */}
      {errorMessage && (
        <div
          id="search-error"
          role="alert"
          className="flex items-center gap-2 text-sm font-medium text-rose-600 dark:text-rose-400 animate-fadeIn"
        >
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Destination Confirmation / Active State */}
      {activeDestination && (
        <div
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-3 rounded-full border border-blue-200 bg-blue-50/90 px-4 py-2 text-sm text-blue-900 shadow-sm backdrop-blur-sm dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-200 animate-fadeIn"
        >
          <span className="flex h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-ping" />
          <span>
            Let&apos;s explore <strong>{activeDestination}</strong>.
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="ml-1 rounded-full p-1 text-blue-700 hover:bg-blue-200/60 dark:text-blue-300 dark:hover:bg-blue-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Change destination"
            title="Change destination"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
