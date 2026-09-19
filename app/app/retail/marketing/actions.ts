"use server";

import { createClient } from "@/lib/supabase/server";

export async function syncPurchaseToMeta(
  orderTotal: number, 
  currency: string = "INR",
  customerEmail?: string,
  customerPhone?: string,
  clientIp?: string,
  clientUserAgent?: string,
  eventId?: string
) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  
  const { data: profile } = await supabase
    .from("onboarding_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
    
  if (!profile?.organization_id) throw new Error("No organization found");

  const orgId = profile.organization_id;

  const { data: org } = await supabase
    .from("organizations")
    .select("meta_pixel_id, meta_access_token")
    .eq("id", orgId)
    .single();

  if (!org?.meta_pixel_id || !org?.meta_access_token) {
    console.warn("Meta CAPI skipped: Missing Pixel ID or Access Token");
    return { success: false, error: "Missing Meta credentials" };
  }

  // Generate a unique event_id for deduplication if not provided
  const deduplicationId = eventId || `omni_${orgId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Hash PII for Meta's advanced matching (SHA-256)
  const encoder = new TextEncoder();
  let hashedEmail: string | undefined;
  let hashedPhone: string | undefined;

  if (customerEmail) {
    const emailHash = await crypto.subtle.digest("SHA-256", encoder.encode(customerEmail.trim().toLowerCase()));
    hashedEmail = Array.from(new Uint8Array(emailHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  if (customerPhone) {
    // Normalize: strip spaces/dashes, keep country code
    const normalizedPhone = customerPhone.replace(/[\s\-()]/g, '');
    const phoneHash = await crypto.subtle.digest("SHA-256", encoder.encode(normalizedPhone));
    hashedPhone = Array.from(new Uint8Array(phoneHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const userData: Record<string, unknown> = {
    // Use real IP and User-Agent for match quality (P1 fix from audit)
    client_ip_address: clientIp || "0.0.0.0",
    client_user_agent: clientUserAgent || "OmniRelay-Server-CAPI/1.0"
  };

  if (hashedEmail) userData.em = [hashedEmail];
  if (hashedPhone) userData.ph = [hashedPhone];

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: deduplicationId,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: currency,
          value: orderTotal
        }
      }
    ]
  };

  try {
    const url = `https://graph.facebook.com/v19.0/${org.meta_pixel_id}/events?access_token=${org.meta_access_token}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error("Meta CAPI Error Response:", result);
      return { success: false, error: result.error?.message || "CAPI request failed" };
    }

    return { success: true, eventId: deduplicationId, events_received: result.events_received };
  } catch (error) {
    console.error("Meta CAPI Network Error:", error);
    return { success: false, error: "Failed to sync to Meta" };
  }
}
