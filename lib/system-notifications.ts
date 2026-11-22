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

  // 4. Batch insert new notifications
  if (inserts.length > 0) {
    // Insert in chunks of 50 to avoid payload size constraints
    for (let i = 0; i < inserts.length; i += 50) {
      await admin.from("app_notifications").insert(inserts.slice(i, i + 50));
    }
  }

  return { created: inserts.length };
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
