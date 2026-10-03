-- Migration: Add phone_number column to profiles table (if not already present)
-- Run this in your Supabase SQL Editor BEFORE deploying the WhatsApp OTP feature.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Optional: unique index so no two users share the same phone
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_key
  ON profiles (phone_number)
  WHERE phone_number IS NOT NULL;

-- Grant edge function service role permission to update profiles
-- (this is already allowed via SUPABASE_SERVICE_ROLE_KEY in the edge function)
