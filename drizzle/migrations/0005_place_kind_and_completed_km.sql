ALTER TABLE public.places ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'destination';
ALTER TABLE public.places ADD CONSTRAINT places_kind_check CHECK (kind IN ('destination','hotel','break','fuel'));
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS completed_km double precision;