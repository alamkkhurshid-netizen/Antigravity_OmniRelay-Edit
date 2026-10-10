-- Migration: Update Voice Rate Card to ₹3.99/min and add Multi-Vertical Support (Healthcare, Retail, Hospitality)

-- 1. Ensure updated_at exists on billing.meta_rate_card
ALTER TABLE billing.meta_rate_card 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update Voice Rate Card in Billing Schema to 399 paise (₹3.99/min Standard)
UPDATE billing.meta_rate_card
SET base_rate_paise = 399,
    updated_at = NOW()
WHERE channel = 'voice' AND category = 'voice' AND country_code = 'IN' AND active = TRUE;

-- Insert if not present, aligning with partial unique index idx_active_meta_rate (channel, country_code, category) WHERE active = TRUE
INSERT INTO billing.meta_rate_card (channel, country_code, category, base_rate_paise, currency, active)
VALUES ('voice', 'IN', 'voice', 399, 'INR', true)
ON CONFLICT (channel, country_code, category) WHERE active = TRUE
DO UPDATE SET base_rate_paise = 399, updated_at = NOW();

-- 2. Add Multi-Vertical fields to public.voice_agent_configs
ALTER TABLE public.voice_agent_configs
ADD COLUMN IF NOT EXISTS business_vertical TEXT DEFAULT 'healthcare',
ADD COLUMN IF NOT EXISTS vertical_settings JSONB DEFAULT '{
  "vertical": "healthcare",
  "enable_booking": true,
  "enable_emergency_bypass": true,
  "order_tracking_enabled": false,
  "room_reservation_enabled": false
}'::jsonb;

-- Create index for fast vertical-level lookups
CREATE INDEX IF NOT EXISTS idx_voice_configs_vertical 
ON public.voice_agent_configs(business_vertical);
