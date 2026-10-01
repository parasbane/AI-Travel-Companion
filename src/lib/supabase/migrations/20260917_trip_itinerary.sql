-- =============================================================================
-- Migration: Day-by-Day Itinerary Foundation
-- Date: 2026-09-17
-- Tables: public.trip_days, public.itinerary_items
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. public.trip_days
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_days (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_number INT         NOT NULL,
  date       DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trip_days_trip_day_unique UNIQUE (trip_id, day_number),
  CONSTRAINT trip_days_day_number_check CHECK (day_number > 0)
);

-- Index: ordered days within a trip
CREATE INDEX IF NOT EXISTS idx_trip_days_trip_order
  ON public.trip_days (trip_id, day_number ASC);

-- Index: list a user's trip days by newest first
CREATE INDEX IF NOT EXISTS idx_trip_days_user_created
  ON public.trip_days (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. public.itinerary_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.itinerary_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  trip_day_id     UUID        NOT NULL REFERENCES public.trip_days(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id        TEXT        NOT NULL,
  place_name      TEXT        NOT NULL,
  place_category  TEXT        NOT NULL,
  place_image_url TEXT,
  start_time      TIME,
  end_time        TIME,
  notes           TEXT,
  sort_order      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT itinerary_items_day_place_unique UNIQUE (trip_day_id, place_id)
);

-- Index: ordered items within a day
CREATE INDEX IF NOT EXISTS idx_itinerary_items_day_order
  ON public.itinerary_items (trip_day_id, sort_order ASC);

-- Index: list a user's itinerary items by newest first
CREATE INDEX IF NOT EXISTS idx_itinerary_items_user_created
  ON public.itinerary_items (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.trip_days       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_items ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3a. RLS policies — trip_days
-- ---------------------------------------------------------------------------

CREATE POLICY "trip_days: select own"
  ON public.trip_days
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_days.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_days: insert own"
  ON public.trip_days
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_days.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_days: update own"
  ON public.trip_days
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_days.trip_id
        AND trips.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_days.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_days: delete own"
  ON public.trip_days
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_days.trip_id
        AND trips.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3b. RLS policies — itinerary_items
-- A day must belong to the same trip, the trip must belong to the caller, and
-- the item's user_id must be the caller (defense in depth against cross-user
-- assignment even though trip ownership already scopes the trip).
-- ---------------------------------------------------------------------------

CREATE POLICY "itinerary_items: select own"
  ON public.itinerary_items
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trip_days
      WHERE trip_days.id = itinerary_items.trip_day_id
        AND trip_days.trip_id = itinerary_items.trip_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itinerary_items.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "itinerary_items: insert own"
  ON public.itinerary_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trip_days
      WHERE trip_days.id = itinerary_items.trip_day_id
        AND trip_days.trip_id = itinerary_items.trip_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itinerary_items.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "itinerary_items: update own"
  ON public.itinerary_items
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trip_days
      WHERE trip_days.id = itinerary_items.trip_day_id
        AND trip_days.trip_id = itinerary_items.trip_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itinerary_items.trip_id
        AND trips.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trip_days
      WHERE trip_days.id = itinerary_items.trip_day_id
        AND trip_days.trip_id = itinerary_items.trip_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itinerary_items.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "itinerary_items: delete own"
  ON public.itinerary_items
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trip_days
      WHERE trip_days.id = itinerary_items.trip_day_id
        AND trip_days.trip_id = itinerary_items.trip_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itinerary_items.trip_id
        AND trips.user_id = auth.uid()
    )
  );