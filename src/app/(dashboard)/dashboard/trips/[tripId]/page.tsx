"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTrips } from "@/context/TripsContext";
import TripDetails from "@/components/dashboard/TripDetails";

function LoadingState() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 text-center">
      <div className="inline-flex items-center gap-2 text-sm text-zinc-500">
        <svg className="h-5 w-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading your trip...
      </div>
    </div>
  );
}

function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 text-center">
      <div className="mx-auto max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl text-zinc-500 dark:bg-zinc-800">
          🗺️
        </div>
        <h1 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {message}
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default function TripDetailsPage() {
  const params = useParams<{ tripId: string }>();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { trips, isLoading: areTripsLoading } = useTrips();

  if (isAuthLoading || areTripsLoading) {
    return <LoadingState />;
  }

  if (!user) {
    return (
      <EmptyState
        title="Sign in to view your trip"
        message="You need to be signed in to see trip details."
      />
    );
  }

  const trip = trips.find((item) => item.id === params.tripId);

  if (!trip) {
    return (
      <EmptyState
        title="Trip not found"
        message="Sorry, we couldn't find that trip. It may have been deleted or you may not have access to it."
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <TripDetails trip={trip} />
    </div>
  );
}