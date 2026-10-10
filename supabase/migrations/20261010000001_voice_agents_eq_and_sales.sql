-- Migration: Add Healthcare Business Category, Emotional Intelligence (EQ), and AI Sales Agent settings
ALTER TABLE public.voice_agent_configs
ADD COLUMN IF NOT EXISTS business_category TEXT DEFAULT 'dental',
ADD COLUMN IF NOT EXISTS receptionist_eq_tone TEXT DEFAULT 'empathetic',
ADD COLUMN IF NOT EXISTS sales_agent_name TEXT DEFAULT 'Rohan',
ADD COLUMN IF NOT EXISTS sales_agent_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sales_eq_style TEXT DEFAULT 'consultative',
ADD COLUMN IF NOT EXISTS sales_packages JSONB DEFAULT '[
  {"name": "Comprehensive Dental & Scaling Package", "price_inr": 999, "description": "Ultrasonic scaling, polishing, intraoral scan & consultation"},
  {"name": "Full Smile & Teeth Whitening Treatment", "price_inr": 4999, "description": "Laser teeth whitening with custom enamel protection"}
]'::jsonb,
ADD COLUMN IF NOT EXISTS sales_campaign_type TEXT DEFAULT 'promotional_leads',
ADD COLUMN IF NOT EXISTS outbound_calling_window JSONB DEFAULT '{"start": "09:30", "end": "19:30"}'::jsonb;
