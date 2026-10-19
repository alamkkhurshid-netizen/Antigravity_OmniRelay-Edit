import { NextResponse } from "next/server";
import { runSystemHealthChecks } from "@/lib/monitoring/health-checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const healthReport = await runSystemHealthChecks();

  // Return 503 when required dependencies fail or status is down
  const requiredFailed = Object.values(healthReport.subsystems).some(
    (s) => s.required && s.status !== "healthy"
  );

  const statusCode = requiredFailed || healthReport.status === "down" ? 503 : 200;

  return NextResponse.json(healthReport, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
