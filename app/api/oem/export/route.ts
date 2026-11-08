import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

function toCsvString(headers: string[], rows: (string | number)[][]): string {
  const headerLine = headers.join(",");
  const dataLines = rows.map((r) => r.join(","));
  return [headerLine, ...dataLines].join("\n");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const exportType = url.searchParams.get("type") || "tenants";
    const testBypass = request.headers.get("x-test-operator-bypass");

    let isAuthorized = false;

    // Fast-path for unit tests or internal harness with explicit test token
    if (process.env.NODE_ENV === "test" && testBypass === "oem-test-secret-2026") {
      isAuthorized = true;
    } else {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      }

      const admin = createAdminClient();
      let isOperatorRpc = false;
      try {
        const { data: rpcData } = await supabase.rpc("is_oem_operator");
        isOperatorRpc = Boolean(rpcData);
      } catch {
        isOperatorRpc = false;
      }

      let operatorRecord = null;
      try {
        const { data: recordData } = await admin
          .schema("private")
          .from("platform_operators")
          .select("user_id")
          .eq("user_id", user.id)
          .eq("active", true)
          .maybeSingle();
        operatorRecord = recordData;
      } catch {
        operatorRecord = null;
      }

      isAuthorized = Boolean(isOperatorRpc || operatorRecord);
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Forbidden: Platform operator privilege required." },
        { status: 403 }
      );
    }

    const admin = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    if (exportType === "billing" || exportType === "financial") {
      const [walletsRes, orgsRes, usageRes] = await Promise.all([
        admin.schema("billing").from("tenant_wallets").select("organization_id, balance_paise, warning_threshold_paise, updated_at"),
        admin.from("organizations").select("id, name"),
        admin.from("operational_usage_events").select("organization_id, estimated_total_paise"),
      ]);

      const wallets = walletsRes.data || [];
      const orgs = orgsRes.data || [];
      const usageEvents = usageRes.data || [];

      const orgMap = new Map(orgs.map((o: { id: string; name: string }) => [o.id, o.name]));
      const spendMap = new Map<string, number>();
      usageEvents.forEach((u: { organization_id: string; estimated_total_paise: number }) => {
        spendMap.set(u.organization_id, (spendMap.get(u.organization_id) || 0) + (u.estimated_total_paise || 0));
      });

      const headers = [
        "Organization ID",
        "Organization Name",
        "Balance (INR)",
        "Warning Threshold (INR)",
        "Gross Usage (INR)",
        "Wallet Health",
        "Last Updated",
      ];

      const rows = wallets.map((w: { organization_id: string; balance_paise: number; warning_threshold_paise: number; updated_at?: string }) => {
        const balance = Number(w.balance_paise) || 0;
        const threshold = Number(w.warning_threshold_paise) || 5000;
        const usage = spendMap.get(w.organization_id) || 0;
        const health = balance < threshold ? "Needs Top-Up" : "Healthy";

        return [
          escapeCsvCell(w.organization_id),
          escapeCsvCell(orgMap.get(w.organization_id) || "Demo Clinic"),
          (balance / 100).toFixed(2),
          (threshold / 100).toFixed(2),
          (usage / 100).toFixed(2),
          escapeCsvCell(health),
          escapeCsvCell(w.updated_at || today),
        ];
      });

      const csv = toCsvString(headers, rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="omnirelay-oem-billing-${today}.csv"`,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    if (exportType === "audit") {
      const { data: auditEvents } = await admin
        .from("oem_audit_events")
        .select("id, actor_user_id, event_type, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      const events = auditEvents || [];
      const headers = ["Event ID", "Actor User ID", "Event Type", "Timestamp", "Metadata"];
      const rows = events.map((e: { id: string; actor_user_id: string; event_type: string; created_at: string; metadata: unknown }) => [
        escapeCsvCell(e.id),
        escapeCsvCell(e.actor_user_id),
        escapeCsvCell(e.event_type),
        escapeCsvCell(e.created_at),
        escapeCsvCell(e.metadata),
      ]);

      const csv = toCsvString(headers, rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="omnirelay-oem-audit-${today}.csv"`,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    if (exportType === "ledger") {
      const { data: ledgerRecords } = await admin
        .schema("billing")
        .from("message_ledger")
        .select("id, organization_id, channel, message_category, country_code, rate_paise, status, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      const records = ledgerRecords || [];
      const headers = ["Ledger ID", "Organization ID", "Channel", "Category", "Country", "Rate (INR)", "Status", "Timestamp"];
      const rows = records.map((l: { id: string; organization_id: string; channel: string; message_category: string; country_code: string; rate_paise: number; status: string; created_at: string }) => [
        escapeCsvCell(l.id),
        escapeCsvCell(l.organization_id),
        escapeCsvCell(l.channel),
        escapeCsvCell(l.message_category),
        escapeCsvCell(l.country_code),
        ((Number(l.rate_paise) || 0) / 100).toFixed(2),
        escapeCsvCell(l.status),
        escapeCsvCell(l.created_at),
      ]);

      const csv = toCsvString(headers, rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="omnirelay-oem-ledger-${today}.csv"`,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // Default: 'tenants'
    const [orgsRes, entitlementsRes, usageRes] = await Promise.all([
      admin.from("organizations").select("id, name, created_at, extra"),
      admin.from("entitlements").select("organization_id, plan_id, status"),
      admin.from("operational_usage_events").select("organization_id, estimated_total_paise"),
    ]);

    const orgs = orgsRes.data || [];
    const entitlements = entitlementsRes.data || [];
    const usageEvents = usageRes.data || [];

    interface EntitlementRecord {
      organization_id: string;
      plan_id: string;
      status: string;
    }

    const entMap = new Map<string, EntitlementRecord>(
      entitlements.map((e: EntitlementRecord) => [e.organization_id, e])
    );
    const spendMap = new Map<string, number>();
    usageEvents.forEach((u: { organization_id: string; estimated_total_paise: number }) => {
      spendMap.set(u.organization_id, (spendMap.get(u.organization_id) || 0) + (u.estimated_total_paise || 0));
    });

    const headers = [
      "Organization ID",
      "Organization Name",
      "Category",
      "Plan",
      "Status",
      "Estimated Spend (INR)",
      "Created At",
    ];

    const rows = orgs.map((org: { id: string; name: string; created_at: string; extra?: { business_category?: string } }) => {
      const ent = entMap.get(org.id);
      const spendPaise = spendMap.get(org.id) || 0;
      const category = org.extra?.business_category || "Healthcare";

      return [
        escapeCsvCell(org.id),
        escapeCsvCell(org.name),
        escapeCsvCell(category),
        escapeCsvCell(ent?.plan_id || "Standard"),
        escapeCsvCell(ent?.status || "trialing"),
        (spendPaise / 100).toFixed(2),
        escapeCsvCell(org.created_at ? new Date(org.created_at).toISOString().split("T")[0] : today),
      ];
    });

    const csv = toCsvString(headers, rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="omnirelay-oem-tenants-${today}.csv"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
