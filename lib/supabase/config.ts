// These values are intentionally public. Supabase publishable keys identify the
// project in browser clients; data access is still enforced by Auth and RLS.
export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "https://bywsjwpaezdlicsbujbk.supabase.co";

export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "sb_publishable_yy_OhffP2OUBVLTh84Ikeg_ASNIgsNr";
