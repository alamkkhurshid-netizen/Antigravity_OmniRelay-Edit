-- Add dual telephony provisioning columns to voice_agent_configs table
ALTER TABLE public.voice_agent_configs 
ADD COLUMN IF NOT EXISTS telephony_mode TEXT NOT NULL DEFAULT 'smart_forwarding',
ADD COLUMN IF NOT EXISTS forwarding_carrier TEXT DEFAULT 'airtel',
ADD COLUMN IF NOT EXISTS forwarding_phone_number TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS vmn_number TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS vmn_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS vmn_plan_active BOOLEAN DEFAULT false;

-- Add index on vmn_number and forwarding_phone_number for fast telephony resolution
CREATE INDEX IF NOT EXISTS idx_voice_configs_vmn_number ON public.voice_agent_configs(vmn_number);
CREATE INDEX IF NOT EXISTS idx_voice_configs_forwarding_phone ON public.voice_agent_configs(forwarding_phone_number);
