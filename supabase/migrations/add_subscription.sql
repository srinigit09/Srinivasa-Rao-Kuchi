-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,           -- 'unlimited', '30days', '1year', 'custom'
  label TEXT NOT NULL,          -- display label
  days INTEGER,                 -- NULL = unlimited
  price_per_tenant NUMERIC(10,2) DEFAULT 0,
  price_per_property NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default plans
INSERT INTO subscription_plans (name, label, days, price_per_tenant, price_per_property) VALUES
  ('unlimited', 'Unlimited (Free)', NULL, 0, 0),
  ('30days', '30 Days Trial', 30, 0, 0),
  ('1year', '1 Year', 365, 99, 499),
  ('custom', 'Custom', NULL, 99, 499)
ON CONFLICT DO NOTHING;

-- Add subscription fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'unlimited';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_tenant_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_property_count INTEGER DEFAULT 0;
