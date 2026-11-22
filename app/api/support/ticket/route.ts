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

    // Dispatch email notification to support@synthycon.com if Resend is configured
    if (process.env.RESEND_API_KEY) {
      const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || "support@omnirelay.in";
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: ["support@synthycon.com"],
            reply_to: email,
            subject: `[OmniRelay Support ${ticketNumber}] ${subject} (${priority.toUpperCase()})`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0d9488; margin-top: 0;">New Support Ticket: ${ticketNumber}</h2>
                <p><strong>Priority:</strong> <span style="text-transform: uppercase; color: ${priority === 'urgent' ? '#e11d48' : '#0f172a'};">${priority}</span></p>
                <p><strong>Clinic / Org:</strong> ${organization?.name || "OmniRelay Workspace"}</p>
                <p><strong>User:</strong> ${name || "Staff Member"} (${email}${phone ? `, ${phone}` : ""})</p>
                <p><strong>Page URL:</strong> ${pathname}</p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
                <h3 style="margin-bottom: 8px;">Subject: ${subject}</h3>
                <div style="background-color: #f8fafc; padding: 12px; border-radius: 6px; white-space: pre-wrap; font-size: 14px; color: #334155;">${message}</div>
              </div>
            `,
          }),
        }).catch((e) => console.error("[Resend Support Ticket Email Error]", e));
      } catch (emailErr) {
        console.error("[Resend Support Ticket Email Exception]", emailErr);
      }
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
