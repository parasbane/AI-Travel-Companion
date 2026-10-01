"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTrips } from "@/context/TripsContext";
import { CURATED_DESTINATIONS } from "@/lib/places/curatedData";

interface CreateTripModalProps {
  open: boolean;
  onClose: () => void;
}

const DESTINATIONS = Object.entries(CURATED_DESTINATIONS).map(
  ([slug, dataset]) => ({ slug, name: dataset.info.name })
);

interface FormErrors {
  title?: string;
  destination?: string;
  endDate?: string;
}

export default function CreateTripModal({ open, onClose }: CreateTripModalProps) {
  const { createTrip } = useTrips();

  const [title, setTitle] = useState("");
  const [destinationSlug, setDestinationSlug] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!title.trim()) {
      next.title = "Trip name is required";
    } else if (title.trim().length > 100) {
      next.title = "Trip name must be 100 characters or fewer";
    }
    if (!destinationSlug) {
      next.destination = "Choose a destination";
    }
    if (startDate && endDate && endDate < startDate) {
      next.endDate = "End date must be on or after the start date";
    }
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const destination = DESTINATIONS.find((d) => d.slug === destinationSlug);
    if (!destination) return;

    setIsSubmitting(true);
    const trip = await createTrip({
      title: title.trim(),
      destinationSlug: destination.slug,
      destinationName: destination.name,
      startDate: startDate || null,
      endDate: endDate || null,
    });
    setIsSubmitting(false);

    if (trip) {
      onClose();
    } else {
      setSubmitError("Could not create this trip. Please try again.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-trip-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn"
    >
      {/* Click outside backdrop */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-left">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-6 pb-4 dark:border-zinc-800">
          <div>
            <h2
              id="create-trip-modal-title"
              className="text-lg font-bold text-zinc-900 dark:text-white"
            >
              Create a New Trip
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Plan your next escape to keep it tracked here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            aria-label="Close create trip dialog"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {submitError && (
          <div
            role="alert"
            className="mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 animate-fadeIn"
          >
            {submitError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">
          <Input
            label="Trip name"
            id="trip-name"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Goa Family Getaway"
            error={errors.title}
            maxLength={100}
          />

          {/* Destination select */}
          <div className="w-full space-y-1.5 text-left">
            <label
              htmlFor="trip-destination"
              className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200"
            >
              Destination
            </label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <select
                id="trip-destination"
                value={destinationSlug}
                onChange={(e) => setDestinationSlug(e.target.value)}
                aria-invalid={Boolean(errors.destination)}
                className={`w-full appearance-none rounded-xl border bg-white py-2.5 pr-10 text-sm sm:text-base pl-10 text-zinc-900 transition-all duration-150 focus:outline-none focus-visible:ring-2 dark:bg-zinc-900 dark:text-white ${
                  errors.destination
                    ? "border-rose-500 focus-visible:border-rose-500 focus-visible:ring-rose-500/20"
                    : "border-zinc-300 hover:border-zinc-400 focus-visible:border-blue-600 focus-visible:ring-blue-600/20 dark:border-zinc-700 dark:hover:border-zinc-600 dark:focus-visible:border-blue-500"
                } ${destinationSlug ? "" : "text-zinc-400 dark:placeholder:text-zinc-500"}`}
              >
                <option value="" disabled>
                  Select a destination
                </option>
                {DESTINATIONS.map((destination) => (
                  <option key={destination.slug} value={destination.slug}>
                    {destination.name}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {errors.destination && (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 animate-fadeIn"
              >
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span>{errors.destination}</span>
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="Start date"
              id="trip-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="End date"
              id="trip-end-date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              error={errors.endDate}
            />
          </div>

          {/* Footer */}
          <div className="-mx-6 -mb-6 mt-6 flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <Button type="button" variant="outline" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
              Create Trip
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}