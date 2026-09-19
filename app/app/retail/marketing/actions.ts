"use server";

import { createClient } from "@/lib/supabase/server";

export async function syncPurchaseToMeta(orderTotal: number, currency: string = "INR") {
  const supabase = await createClient();
  
  // Get current user's organization
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  
  const { data: profile } = await supabase
    .from("onboarding_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
    
  if (!profile?.organization_id) throw new Error("No organization found");

  const orgId = profile.organization_id;

  // Get Meta credentials
  const { data: org } = await supabase
    .from("organizations")
    .select("meta_pixel_id, meta_access_token")
    .eq("id", orgId)
    .single();

  if (!org?.meta_pixel_id || !org?.meta_access_token) {
    console.warn("Meta CAPI skipped: Missing Pixel ID or Access Token");
    return { success: false, error: "Missing Meta credentials" };
  }

  // Build the Facebook Conversions API payload
  // In a real implementation, we'd hash customer data (email/phone) 
  // and include the actual client IP and User Agent.
  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "system_generated",
        user_data: {
          client_ip_address: "127.0.0.1",
          client_user_agent: "OmniRelay-Server-CAPI/1.0"
        },
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
    console.log("Meta CAPI Response:", result);
    return { success: true };
  } catch (error) {
    console.error("Meta CAPI Error:", error);
    return { success: false, error: "Failed to sync to Meta" };
  }
}
