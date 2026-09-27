ALTER TABLE public.places
  ADD COLUMN has_stay boolean NOT NULL DEFAULT false,
  ADD COLUMN stay_name text,
  ADD COLUMN stay_address text,
  ADD COLUMN stay_check_in timestamptz,
  ADD COLUMN stay_check_out timestamptz,
  ADD COLUMN stay_notes text;