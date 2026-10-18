import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { buildMonthlyReportMetrics, generateMonthlyReportHtml, generateMonthlyEmailSummary } from "@/lib/reports/monthly-summary";

export async function GET(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !organization) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "json"; // "json" | "html"
  const monthParam = searchParams.get("month");
  const month = monthParam || new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  // Calculate accurate start and end timestamps for the requested reporting month
  let startOfMonth: Date;
  let endOfMonth: Date;

  if (monthParam) {
    const candidate = monthParam.includes(" ") ? `1 ${monthParam}` : `${monthParam}-01`;
    const parsed = new Date(Date.parse(candidate));
    if (!isNaN(parsed.getTime())) {
      startOfMonth = new Date(parsed.getFullYear(), parsed.getMonth(), 1, 0, 0, 0, 0);
      endOfMonth = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 1, 0, 0, 0, 0);
    } else {
      const now = new Date();
      startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    }
  } else {
    const now = new Date();
    startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  const [
    { data: appointments },
    { data: reminders },
    { data: queueEntries },
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("id,status,payment:appointment_payments(amount_paise,status,payment_mode)")
      .eq("organization_id", organization.id)
      .gte("starts_at", startOfMonth.toISOString())
      .lt("starts_at", endOfMonth.toISOString()),
    supabase
      .from("appointment_reminders")
      .select("id,status")
      .eq("organization_id", organization.id)
      .gte("created_at", startOfMonth.toISOString())
      .lt("created_at", endOfMonth.toISOString()),
    supabase
      .from("patient_queue")
      .select("arrived_at,called_at")
      .eq("organization_id", organization.id)
      .gte("arrived_at", startOfMonth.toISOString())
      .lt("arrived_at", endOfMonth.toISOString()),
  ]);

  const apps = appointments || [];
  const booked = apps.length;
  let completed = 0;
  let noShow = 0;
  let cancelled = 0;
  let grossRevenuePaise = 0;
  let onlineRevenuePaise = 0;

  for (const a of apps) {
    if (a.status === "completed") completed++;
    else if (a.status === "no_show") noShow++;
    else if (a.status === "cancelled") cancelled++;

    const payments = Array.isArray(a.payment) ? a.payment : a.payment ? [a.payment] : [];
    for (const p of payments) {
      if (p.status === "paid") {
        const amt = Number(p.amount_paise || 0);
        grossRevenuePaise += amt;
        if (p.payment_mode === "full_online" || p.payment_mode === "deposit_online") {
          onlineRevenuePaise += amt;
        }
      }
    }
  }

  const rems = reminders || [];
  const remindersDispatched = rems.length;
  let remindersDelivered = 0;
  let remindersRead = 0;
  for (const r of rems) {
    if (r.status === "delivered" || r.status === "read") remindersDelivered++;
    if (r.status === "read") remindersRead++;
  }

  // Calculate wait times honestly: return null if no queue records exist (no fabricated defaults)
  const queues = queueEntries || [];
  let totalWait = 0;
  let count = 0;
  for (const q of queues) {
    if (q.arrived_at && q.called_at) {
      const wait = Math.max(0, (new Date(q.called_at).getTime() - new Date(q.arrived_at).getTime()) / 60000);
      totalWait += wait;
      count++;
    }
  }
  const avgWaitMinutes: number | null = count > 0 ? Math.round(totalWait / count) : null;


  const metrics = buildMonthlyReportMetrics({
    organizationId: organization.id,
    organizationName: organization.name,
    month,
    booked,
    completed,
    noShow,
    cancelled,
    remindersDispatched,
    remindersDelivered,
    remindersRead,
    avgWaitMinutes,
    grossRevenuePaise,
    onlineRevenuePaise,
  });

  if (format === "html") {
    const html = generateMonthlyReportHtml(metrics);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="omnirelay-report-${month.toLowerCase().replace(/\s+/g, "-")}.html"`,
      },
    });
  }

  const emailSummary = generateMonthlyEmailSummary(metrics);
  return NextResponse.json({
    metrics,
    emailSummary,
  });
}
