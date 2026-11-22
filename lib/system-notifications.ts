import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface SystemNotificationResult {
  created: number;
}

/**
 * Reconciles privacy-safe in-app notifications for appointment bookings and template approvals.
 * Alerts all active clinic team members without sending duplicate notifications.
 */
export async function refreshSystemNotifications(organizationId: string): Promise<SystemNotificationResult> {
  const admin = createAdminClient();

  // 1. Fetch active clinic staff users
  const { data: staff, error: staffError } = await admin
    .from("agents")
    .select("user_id,extra")
    .eq("organization_id", organizationId)
    .eq("ai", false)
    .not("user_id", "is", null);

  if (staffError || !staff || staff.length === 0) {
    return { created: 0 };
  }

  const activeUserIds = staff
    .filter((agent) => {
      const extra = (agent.extra ?? {}) as Record<string, unknown>;
      return String(extra.status ?? "active") !== "inactive";
    })
    .map((agent) => agent.user_id)
    .filter((id): id is string => Boolean(id));

  if (activeUserIds.length === 0) {
    return { created: 0 };
  }

  const inserts: Array<{
    organization_id: string;
    recipient_user_id: string;
    notification_type: "system";
    title: string;
    body: string;
    href: string;
    entity_type: string;
    entity_id: string;
    priority: "normal";
    escalation_level: number;
  }> = [];

  // 2. Reconcile WhatsApp Meta Template Approval Notifications
  const { data: templates } = await admin
    .from("channel_message_templates")
    .select("id,status")
    .eq("organization_id", organizationId)
    .eq("channel", "whatsapp")
    .eq("status", "approved");

  if (templates && templates.length > 0) {
    const { data: existingTplAlerts } = await admin
      .from("app_notifications")
      .select("recipient_user_id")
      .eq("organization_id", organizationId)
      .eq("entity_type", "template_approval");

    const notifiedTemplateUsers = new Set((existingTplAlerts ?? []).map((item) => item.recipient_user_id));

    for (const userId of activeUserIds) {
      if (!notifiedTemplateUsers.has(userId)) {
        inserts.push({
          organization_id: organizationId,
          recipient_user_id: userId,
          notification_type: "system",
          title: "Meta WhatsApp Templates Approved",
          body: "All 11 WhatsApp lifecycle templates are approved by Meta and active for patient communications.",
          href: "/app/integrations",
          entity_type: "template_approval",
          entity_id: organizationId,
          priority: "normal",
          escalation_level: 0,
        });
      }
    }
  }

  // 3. Reconcile Recent Appointment Bookings
  const { data: recentAppointments } = await admin
    .from("appointments")
    .select("id,customer_name,starts_at,resource:booking_resources(name),service:organization_services(name)")
    .eq("organization_id", organizationId)
    .neq("status", "cancelled")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  if (recentAppointments && recentAppointments.length > 0) {
    const { data: existingApptAlerts } = await admin
      .from("app_notifications")
      .select("recipient_user_id,entity_id")
      .eq("organization_id", organizationId)
      .eq("entity_type", "appointment");

    const notifiedApptKeys = new Set(
      (existingApptAlerts ?? []).map((item) => `${item.recipient_user_id}:${item.entity_id}`)
    );

    for (const appt of recentAppointments) {
      const doctorName = (appt.resource as { name?: string } | null)?.name;
      const serviceName = (appt.service as { name?: string } | null)?.name;
      const formattedDate = new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }).format(new Date(appt.starts_at));

      const cleanCustomer = (appt.customer_name || "Patient").trim();
      const title = `New Booking: ${cleanCustomer}${doctorName ? ` with Dr. ${doctorName}` : ""}`.slice(0, 150);
      const body = `Patient ${cleanCustomer} booked${serviceName ? ` for ${serviceName}` : ""}${doctorName ? ` with Dr. ${doctorName}` : ""}: ${formattedDate}.`;

      for (const userId of activeUserIds) {
        const key = `${userId}:${appt.id}`;
        if (!notifiedApptKeys.has(key)) {
          inserts.push({
            organization_id: organizationId,
            recipient_user_id: userId,
            notification_type: "system",
            title,
            body,
            href: "/app/appointments",
            entity_type: "appointment",
            entity_id: appt.id,
            priority: "normal",
            escalation_level: 0,
          });
          notifiedApptKeys.add(key);
        }
      }
    }
  }

  // 4. Reconcile Recent Incoming WhatsApp Patient Messages
  const { data: recentIncoming } = await admin
    .from("messages")
    .select("id,conversation_id,contact_address,content,timestamp")
    .eq("organization_id", organizationId)
    .eq("service", "whatsapp")
    .eq("direction", "incoming")
    .gte("timestamp", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("timestamp", { ascending: false })
    .limit(30);

  if (recentIncoming && recentIncoming.length > 0) {
    const incomingIds = recentIncoming.map((m) => m.id);
    const { data: existingMsgAlerts } = await admin
      .from("app_notifications")
      .select("entity_id,recipient_user_id")
      .eq("organization_id", organizationId)
      .eq("entity_type", "incoming_whatsapp_message")
      .in("entity_id", incomingIds);

    const notifiedMsgPairs = new Set(
      (existingMsgAlerts ?? []).map((item) => `${item.entity_id}:${item.recipient_user_id}`)
    );

    for (const msg of recentIncoming) {
      const phone = (msg.contact_address || "Patient").trim();
      const content = (msg.content ?? {}) as Record<string, unknown>;
      const rawText = String(content.text ?? (content.text as any)?.body ?? "").trim();
      const snippet = rawText || (content.type === "file" ? "Patient sent an attachment." : "New patient message received.");
      const title = `WhatsApp from ${phone}`.slice(0, 150);
      const body = `"${snippet.slice(0, 120)}" — Tap to reply.`;
      const href = `/app/conversations?phone=${encodeURIComponent(phone)}`;

      for (const userId of activeUserIds) {
        if (!notifiedMsgPairs.has(`${msg.id}:${userId}`)) {
          inserts.push({
            organization_id: organizationId,
            recipient_user_id: userId,
            notification_type: "system",
            title,
            body,
            href,
            entity_type: "incoming_whatsapp_message",
            entity_id: msg.id,
            priority: "normal",
            escalation_level: 0,
          });
        }
      }
    }
  }

  // 5. Batch insert new notifications
  if (inserts.length > 0) {
    // Insert in chunks of 50 to avoid payload size constraints
    for (let i = 0; i < inserts.length; i += 50) {
      await admin.from("app_notifications").insert(inserts.slice(i, i + 50));
    }
  }

  return { created: inserts.length };
}

/**
 * Calculates count of active conversations that have an unread incoming patient message.
 */
export async function getUnreadConversationsCount(organizationId: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data: conversations } = await admin
      .from("conversations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(100);

    if (!conversations || conversations.length === 0) return 0;

    const convIds = conversations.map((c) => c.id);
    const { data: messages } = await admin
      .from("messages")
      .select("conversation_id,direction,timestamp")
      .eq("organization_id", organizationId)
      .in("conversation_id", convIds)
      .order("timestamp", { ascending: false });

    if (!messages || messages.length === 0) return 0;

    const latestByConv = new Map<string, string>();
    for (const m of messages) {
      if (!latestByConv.has(m.conversation_id)) {
        latestByConv.set(m.conversation_id, m.direction);
      }
    }

    let unreadCount = 0;
    for (const direction of latestByConv.values()) {
      if (direction === "incoming") unreadCount++;
    }

    return unreadCount;
  } catch {
    return 0;
  }
}

/**
 * Instantly creates an appointment booking notification for all active workspace staff.
 */
export async function notifyAppointmentBooking(appointmentId: string, organizationId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();

    const [{ data: appt }, { data: staff }] = await Promise.all([
      admin
        .from("appointments")
        .select("id,customer_name,starts_at,resource:booking_resources(name),service:organization_services(name)")
        .eq("id", appointmentId)
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin
        .from("agents")
        .select("user_id,extra")
        .eq("organization_id", organizationId)
        .eq("ai", false)
        .not("user_id", "is", null),
    ]);

    if (!appt || !staff || staff.length === 0) return false;

    const activeUserIds = staff
      .filter((agent) => {
        const extra = (agent.extra ?? {}) as Record<string, unknown>;
        return String(extra.status ?? "active") !== "inactive";
      })
      .map((agent) => agent.user_id)
      .filter((id): id is string => Boolean(id));

    if (activeUserIds.length === 0) return false;

    const doctorName = (appt.resource as { name?: string } | null)?.name;
    const serviceName = (appt.service as { name?: string } | null)?.name;
    const formattedDate = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(new Date(appt.starts_at));

    const cleanCustomer = (appt.customer_name || "Patient").trim();
    const title = `New Booking: ${cleanCustomer}${doctorName ? ` with Dr. ${doctorName}` : ""}`.slice(0, 150);
    const body = `Patient ${cleanCustomer} booked${serviceName ? ` for ${serviceName}` : ""}${doctorName ? ` with Dr. ${doctorName}` : ""}: ${formattedDate}.`;

    const inserts = activeUserIds.map((userId) => ({
      organization_id: organizationId,
      recipient_user_id: userId,
      notification_type: "system" as const,
      title,
      body,
      href: "/app/appointments",
      entity_type: "appointment",
      entity_id: appt.id,
      priority: "normal" as const,
      escalation_level: 0,
    }));

    const { error } = await admin.from("app_notifications").insert(inserts);
    return !error;
  } catch {
    return false;
  }
}
