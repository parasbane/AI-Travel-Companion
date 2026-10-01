"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTrips } from "@/context/TripsContext";
import type { Trip, TripStatus } from "@/lib/saved/types";

interface EditTripModalProps {
  trip: Trip;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS: { id: TripStatus; label: string }[] = [
  { id: "planning", label: "Planning" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
];

interface FormErrors {
  title?: string;
  endDate?: string;
}

export default function EditTripModal({ trip, open, onClose, onSaved }: EditTripModalProps) {
  const { updateTrip } = useTrips();

  const [title, setTitle] = useState(trip.title);
  const [startDate, setStartDate] = useState(trip.startDate ?? "");
  const [endDate, setEndDate] = useState(trip.endDate ?? "");
  const [status, setStatus] = useState<TripStatus>(trip.status);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset the form whenever the dialog transitions to open.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(trip.title);
      setStartDate(trip.startDate ?? "");
      setEndDate(trip.endDate ?? "");
      setStatus(trip.status);
      setErrors({});
      setSubmitError(null);
    }
  }

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

    setIsSubmitting(true);
    const updated = await updateTrip(trip.id, {
      title: title.trim(),
      startDate: startDate || null,
      endDate: endDate || null,
      status,
    });
    setIsSubmitting(false);

    if (updated) {
      onSaved();
      onClose();
    } else {
      setSubmitError("Could not update this trip. Please try again.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-trip-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-left">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-6 pb-4 dark:border-zinc-800">
          <div>
            <h2
              id="edit-trip-modal-title"
              className="text-lg font-bold text-zinc-900 dark:text-white"
            >
              Edit trip
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Update the trip name, dates, or status.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            aria-label="Close edit trip dialog"
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

          <div className="w-full space-y-1.5 text-left">
            <label
              htmlFor="trip-status"
              className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200"
            >
              Status
            </label>
            <select
              id="trip-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TripStatus)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm sm:text-base text-zinc-900 transition-all duration-150 focus:outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="-mx-6 -mb-6 mt-6 flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <Button type="button" variant="outline" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}