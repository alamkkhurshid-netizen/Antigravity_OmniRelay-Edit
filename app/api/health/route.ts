import { NextResponse } from "next/server";
import { runSystemHealthChecks } from "@/lib/monitoring/health-checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const healthReport = await runSystemHealthChecks();
  const statusCode = healthReport.status === "down" ? 503 : healthReport.status === "degraded" ? 200 : 200;

  return NextResponse.json(healthReport, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
