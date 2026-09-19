import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type AuditInput = {
  organizationId: string;
  actorUserId: string;
  subjectAgentId?: string | null;
  eventType: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function recordTeamAudit(input: AuditInput) {
  const admin = createAdminClient();
  await admin.from("team_audit_events").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    subject_agent_id: input.subjectAgentId ?? null,
    event_type: input.eventType,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
}

export async function recordOperationalError(input: {
  organizationId?: string | null;
  actorUserId?: string | null;
  source: string;
  code: string;
  safeMessage: string;
  severity?: "warning" | "error" | "critical";
  metadata?: Record<string, string | number | boolean | null>;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("operational_events").insert({
      organization_id: input.organizationId ?? null,
      actor_user_id: input.actorUserId ?? null,
      event_source: input.source,
      error_code: input.code,
      safe_message: input.safeMessage,
      severity: input.severity ?? "error",
      metadata: input.metadata ?? {},
    });
  } catch {
    // Observability must never replace or mask the original application error.
  }
}

export async function consumeRateLimit(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  bucket: "team_invite" | "team_role_change" | "team_deactivate" | "team_reactivate" | "billing_order" | "conversation_start" | "deposit_acceptance_prepare" | "mobile_alert_test",
  limit: number,
  windowSeconds: number,
) {
  const { data, error } = await supabase.rpc("consume_api_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  return !error && data === true;
}
