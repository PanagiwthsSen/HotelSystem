-- Fix identity sequence for RESERVATION.ReservationID
-- Run this in Supabase SQL editor if auto-increment stops working
-- (JS already works around this by querying MAX + 1)
DO $$
DECLARE
  seq_name TEXT;
  next_val INTEGER;
BEGIN
  SELECT pg_get_serial_sequence('"RESERVATION"', 'ReservationID') INTO seq_name;
  SELECT COALESCE(MAX("ReservationID"), 0) + 1 INTO next_val FROM "RESERVATION";
  IF seq_name IS NOT NULL THEN
    PERFORM setval(seq_name::regclass, next_val, false);
  END IF;
END $$;
