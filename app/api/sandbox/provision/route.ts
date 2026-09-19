import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { faker } from "@faker-js/faker";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { category } = await req.json();

    if (!category) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    // 1. Create Demo Organization via RPC (handles all tenant setup atomically)
    //    Fallback to direct insert if RPC doesn't exist yet
    const demoName = `${faker.company.name()} (Demo ${category})`;
    
    let orgId: string;

    // Try using the onboarding RPC first (handles agent creation, profile linking etc.)
    const { data: rpcResult, error: rpcError } = await supabase.rpc("complete_workspace_onboarding", {
      p_business_name: demoName,
      p_business_category: category,
      p_location_count: 1,
      p_timezone: "Asia/Kolkata",
      p_clinic_mode: category === "Healthcare" ? "solo_practitioner" : null,
      p_primary_provider_name: category === "Healthcare" ? faker.person.fullName() : null,
    });

    if (rpcError) {
      // Fallback: direct insert if RPC fails for anonymous users
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: demoName,
          category: category,
          is_demo: true,
          timezone: "Asia/Kolkata"
        })
        .select("id")
        .single();

      if (orgError) throw orgError;
      orgId = org.id;
    } else {
      // RPC succeeded — find the org that was just created
      const { data: agent } = await supabase
        .from("agents")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("ai", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!agent?.organization_id) throw new Error("Organization creation failed");
      orgId = agent.organization_id;

      // Mark as demo
      await supabase.from("organizations").update({ is_demo: true }).eq("id", orgId);
    }

    // 2. Generate realistic mock AI Drafts for the Action Centre
    const healthcareDrafts = [
      {
        agent_role: "booking_concierge",
        proposed_action: "send_whatsapp_message",
        draft_payload: {
          text: `Why action is needed: ${faker.person.firstName()} missed their 6-month dental checkup. Patients who skip follow-ups have a 40% higher chance of emergency visits.\n\nWhy this is helpful: Proactive follow-ups improve retention by 25% and reduce emergency case load.\n\nHow the outcome will be impacted: Expected to recover 1 appointment worth ₹1,500–₹3,000 in revenue.\n\nProposed Message:\n"Hi ${faker.person.firstName()}, it's been 6 months since your last visit with Dr. ${faker.person.lastName()}. Would you like to schedule a checkup this week? Reply YES to book."`,
          recipient_phone: faker.phone.number({ style: "international" }),
          metadata: { demo: true }
        }
      },
      {
        agent_role: "booking_concierge",
        proposed_action: "send_whatsapp_message",
        draft_payload: {
          text: `Why action is needed: A waitlisted slot opened up for tomorrow at 2:30 PM. ${faker.person.firstName()} has been waiting 3 days.\n\nWhy this is helpful: Fills an empty slot immediately, preventing revenue loss of ₹800–₹1,200.\n\nHow the outcome will be impacted: Utilization rate improves from 78% to 85% for the day.\n\nProposed Message:\n"Hi ${faker.person.firstName()}, great news! An earlier slot just opened up for tomorrow at 2:30 PM with Dr. ${faker.person.lastName()}. Would you like to claim it? Reply YES to confirm."`,
          recipient_phone: faker.phone.number({ style: "international" }),
          metadata: { demo: true }
        }
      },
      {
        agent_role: "titan_advisor",
        proposed_action: "review_advice",
        draft_payload: {
          text: `Why action is needed: Your WhatsApp appointment reminder delivery rate dropped to 82% this week (down from 94% last week). 12 reminders failed.\n\nWhy this is helpful: Patients who don't receive reminders are 3x more likely to no-show, costing ₹1,000–₹2,500 per missed slot.\n\nHow the outcome will be impacted: Fixing delivery issues could recover 4-5 appointments worth ₹6,000–₹12,000 this week.\n\nRecommendation: Check WhatsApp template approval status and verify patient phone numbers in the failed batch. Consider enabling SMS fallback for critical appointment reminders.`,
          metadata: { demo: true }
        }
      }
    ];

    const retailDrafts = [
      {
        agent_role: "titan_advisor",
        proposed_action: "send_whatsapp_message",
        draft_payload: {
          text: `Why action is needed: ${faker.person.firstName()} abandoned their cart (₹${faker.number.int({ min: 800, max: 4500 })}) 2 hours ago. Abandoned carts represent 68% of potential revenue loss.\n\nWhy this is helpful: Cart recovery messages convert at 15–20% when sent within 3 hours.\n\nHow the outcome will be impacted: Expected to recover ₹${faker.number.int({ min: 400, max: 2000 })} in revenue.\n\nProposed Message:\n"Hi ${faker.person.firstName()}, you left something in your cart! Complete your order in the next 4 hours and get 10% off with code SAVE10. Tap here to checkout: [link]"`,
          recipient_phone: faker.phone.number({ style: "international" }),
          metadata: { demo: true }
        }
      },
      {
        agent_role: "titan_advisor",
        proposed_action: "review_advice",
        draft_payload: {
          text: `Why action is needed: Your Meta Ad cost-per-lead increased 18% this week (₹${faker.number.int({ min: 35, max: 85 })} → ₹${faker.number.int({ min: 55, max: 110 })}). The "Pain Point" creative angle is exhausting its audience.\n\nWhy this is helpful: Rotating to the "Social Proof" angle historically reduces CPL by 22% in the first 3 days.\n\nHow the outcome will be impacted: Projected to save ₹${faker.number.int({ min: 2000, max: 8000 })} in ad spend this week while maintaining lead volume.\n\nRecommendation: Pause the current "Pain Point" ad set. Deploy the "Social Proof" creative from your Creative Engine. Monitor CPL for 48 hours before scaling.`,
          metadata: { demo: true }
        }
      },
      {
        agent_role: "titan_advisor",
        proposed_action: "review_advice",
        draft_payload: {
          text: `Why action is needed: ${faker.number.int({ min: 5, max: 15 })} repeat customers haven't ordered in 30+ days. Your repeat purchase rate dropped from 34% to 28%.\n\nWhy this is helpful: Re-engagement campaigns to lapsed customers cost 5x less than acquiring new ones.\n\nHow the outcome will be impacted: A targeted WhatsApp broadcast to this segment typically reactivates 20–30% of lapsed customers.\n\nRecommendation: I can draft a personalized "We miss you" WhatsApp broadcast with a loyalty discount for these ${faker.number.int({ min: 5, max: 15 })} customers. Approve to proceed.`,
          metadata: { demo: true }
        }
      }
    ];

    const drafts = (category === "Healthcare" ? healthcareDrafts : retailDrafts).map(d => ({
      organization_id: orgId,
      context_source: "sandbox_simulation",
      status: "pending_approval",
      ...d
    }));

    const { error: draftError } = await supabase.from("ai_agent_drafts").insert(drafts);
    if (draftError) throw draftError;

    return NextResponse.json({ success: true, orgId });
  } catch (error: any) {
    console.error("Provisioning error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
