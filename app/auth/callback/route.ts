import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await supabase.rpc("accept_workspace_invitations");
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=Unable%20to%20complete%20sign-in", url.origin),
  );
}
