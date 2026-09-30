DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid='public.places'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%kind%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.places DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.places ADD CONSTRAINT places_kind_check CHECK (kind IN ('destination','hotel','break','fuel','start','end'));
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS route_choice integer NOT NULL DEFAULT 0;
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS day_number integer;