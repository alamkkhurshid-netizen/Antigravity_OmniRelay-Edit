import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

interface RuntimeControlPayload {
  controlKey: string;
  isEnabled: boolean;
  scope?: "global" | "tenant";
  organizationId?: string | null;
  reason: string;
  expectedVersion?: number | null;
  expiresAt?: string | null;
  isEmergency?: boolean;
}

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    // Verify platform operator / admin role
    const { data: actor } = await supabase
      .from("agents")
      .select("role, extra")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = (actor?.extra as Record<string, unknown> | null)?.role ?? actor?.role;
    const isOperator = ["admin", "owner", "platform_operator"].includes(String(role));

    if (!isOperator) {
      return NextResponse.json(
        { error: "Forbidden: Platform operator or admin privileges required." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Partial<RuntimeControlPayload>;

    if (!body.controlKey || typeof body.isEnabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid payload: controlKey (string) and isEnabled (boolean) are required." },
        { status: 400 }
      );
    }

    const scope = body.scope ?? "global";
    if (scope !== "global" && scope !== "tenant") {
      return NextResponse.json(
        { error: "Invalid scope. Permitted values are strictly 'global' or 'tenant'." },
        { status: 400 }
      );
    }

    const targetOrgId = scope === "tenant" ? (body.organizationId || organization?.id) : null;
    if (scope === "tenant" && !targetOrgId) {
      return NextResponse.json(
        { error: "organizationId is required when scope is 'tenant'." },
        { status: 400 }
      );
    }

    const reason = body.reason?.trim();
    if (!reason || reason.length < 5) {
      return NextResponse.json(
        { error: "A descriptive reason (minimum 5 characters) is required for audited control updates." },
        { status: 400 }
      );
    }

    const isEmergency = Boolean(body.isEmergency);
    if (isEmergency) {
      if (!body.expiresAt || new Date(body.expiresAt).getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "Emergency overrides strictly require a future expiration timestamp (expiresAt)." },
          { status: 400 }
        );
      }
    }

    // Execute via RPC or admin client to enforce optimistic locking and audit logging
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("set_runtime_control", {
      p_control_key: body.controlKey,
      p_is_enabled: body.isEnabled,
      p_scope: scope,
      p_organization_id: targetOrgId,
      p_reason: reason,
      p_expected_version: body.expectedVersion ?? null,
      p_expires_at: body.expiresAt ?? null,
      p_is_emergency: isEmergency,
    });

    if (error) {
      const isVersionMismatch = error.message?.includes("Optimistic concurrency failure");
      return NextResponse.json(
        { error: error.message },
        { status: isVersionMismatch ? 409 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      control: data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
