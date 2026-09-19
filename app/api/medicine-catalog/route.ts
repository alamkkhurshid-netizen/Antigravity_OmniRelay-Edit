import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const normalizeQuery = (value: string | null) =>
  (value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);

export async function GET(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!organization) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  }

  const query = normalizeQuery(new URL(request.url).searchParams.get("q"));
  if (query.length < 2) {
    return NextResponse.json({ entries: [], ready: true });
  }

  const { data, error } = await supabase
    .rpc("search_active_medicines", { p_query: query, p_limit: 12 });

  if (error) {
    return NextResponse.json(
      { error: "Medicine catalogue search is temporarily unavailable." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { entries: data ?? [], ready: true },
    {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
