-- =============================================================================
-- Migration: Saved Places & My Trips
-- Date: 2026-09-16
-- Tables: public.saved_places, public.trips, public.trip_places
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. public.saved_places
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.saved_places (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id         TEXT        NOT NULL,
  destination_slug TEXT        NOT NULL,
  place_name       TEXT        NOT NULL,
  place_category   TEXT        NOT NULL,
  place_image_url  TEXT,
  place_rating     NUMERIC(3,1),
  place_price_level TEXT,
  place_address    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT saved_places_user_place_unique UNIQUE (user_id, place_id)
);

-- Index: list all saved places for a user ordered by newest first
CREATE INDEX IF NOT EXISTS idx_saved_places_user_created
  ON public.saved_places (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. public.trips
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trips (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL,
  destination_slug TEXT        NOT NULL,
  destination_name TEXT        NOT NULL,
  description      TEXT,
  start_date       DATE,
  end_date         DATE,
  status           TEXT        NOT NULL DEFAULT 'planning',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trips_status_check CHECK (
    status IN ('planning', 'upcoming', 'completed')
  ),
  CONSTRAINT trips_dates_check CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  )
);

-- Index: list all trips for a user ordered by newest first
CREATE INDEX IF NOT EXISTS idx_trips_user_created
  ON public.trips (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. public.trip_places
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_places (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id         TEXT        NOT NULL,
  destination_slug TEXT        NOT NULL,
  place_name       TEXT        NOT NULL,
  place_category   TEXT        NOT NULL,
  place_image_url  TEXT,
  place_rating     NUMERIC(3,1),
  place_price_level TEXT,
  notes            TEXT,
  sort_order       INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trip_places_trip_place_unique UNIQUE (trip_id, place_id)
);

-- Index: ordered place list within a trip
CREATE INDEX IF NOT EXISTS idx_trip_places_trip_order
  ON public.trip_places (trip_id, sort_order ASC);

-- Index: list a user's trip places by newest first
CREATE INDEX IF NOT EXISTS idx_trip_places_user_created
  ON public.trip_places (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_places  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4a. RLS policies — saved_places
-- ---------------------------------------------------------------------------

-- Users can only see their own saved places
CREATE POLICY "saved_places: select own"
  ON public.saved_places
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can only insert rows for themselves; user_id is forced to auth.uid()
CREATE POLICY "saved_places: insert own"
  ON public.saved_places
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can only update their own rows
CREATE POLICY "saved_places: update own"
  ON public.saved_places
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can only delete their own rows
CREATE POLICY "saved_places: delete own"
  ON public.saved_places
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4b. RLS policies — trips
-- ---------------------------------------------------------------------------

CREATE POLICY "trips: select own"
  ON public.trips
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "trips: insert own"
  ON public.trips
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "trips: update own"
  ON public.trips
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "trips: delete own"
  ON public.trips
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4c. RLS policies — trip_places
-- ---------------------------------------------------------------------------

-- Both user_id and the parent trip must belong to auth.uid()
CREATE POLICY "trip_places: select own"
  ON public.trip_places
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_places.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_places: insert own"
  ON public.trip_places
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_places.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_places: update own"
  ON public.trip_places
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_places.trip_id
        AND trips.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_places.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_places: delete own"
  ON public.trip_places
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = trip_places.trip_id
        AND trips.user_id = auth.uid()
    )
  );
