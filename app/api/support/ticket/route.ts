import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json().catch(() => ({}));
    const message = String(body.message ?? "").trim();
    const subject = String(body.subject ?? "OmniRelay Product Support Request").trim();
    const email = String(body.email ?? user?.email ?? "").trim();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const pathname = String(body.pathname ?? "/app");
    const priority = ["normal", "high", "urgent"].includes(body.priority) ? body.priority : "normal";
    const chatContext = Array.isArray(body.chatHistory) ? body.chatHistory.slice(-8) : null;

    if (!message || message.length < 5) {
      return NextResponse.json({ error: "Please enter a detailed message (minimum 5 characters)." }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required so our team can reply." }, { status: 400 });
    }

    const ticketNumber = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
    const admin = createAdminClient();

    const { data: ticket, error } = await admin
      .from("support_tickets")
      .insert({
        ticket_number: ticketNumber,
        organization_id: organization?.id ?? null,
        user_id: user?.id ?? null,
        user_email: email,
        user_name: name || null,
        user_phone: phone || null,
        subject: subject.slice(0, 160),
        message,
        pathname,
        chat_context: chatContext,
        priority,
        status: "open",
      })
      .select("id, ticket_number, created_at")
      .single();

    if (error) {
      console.error("[Support Ticket Error]", error);
      return NextResponse.json({ error: "Failed to create support ticket. Please try again." }, { status: 500 });
    }

    // Optional: Log an operational event for auditing
    if (organization?.id) {
      await admin.from("operational_events").insert({
        organization_id: organization.id,
        event_type: "support_ticket_created",
        severity: priority === "urgent" ? "warning" : "info",
        description: `Support ticket ${ticketNumber} raised: ${subject}`,
        metadata: { ticket_id: ticket.id, ticket_number: ticketNumber, user_email: email, pathname },
      }).catch(() => null);
    }

    return NextResponse.json({
      success: true,
      ticketNumber,
      message: `Support ticket ${ticketNumber} created successfully. Our engineering and support team has been notified and will reply to ${email}.`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
