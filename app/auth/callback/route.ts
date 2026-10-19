import { createServerClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { NextResponse } from "next/server";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") as "magiclink" | "email" | "signup" | "invite" | "recovery") || "magiclink";
  const next = safeNext(url.searchParams.get("next"));
  const share = url.searchParams.get("_vercel_share");
  const nextWithShare = share
    ? `${next}${next.includes("?") ? "&" : "?"}_vercel_share=${encodeURIComponent(share)}`
    : next;

  const targetUrl = new URL(nextWithShare, url.origin);
  const response = NextResponse.redirect(targetUrl);

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        const cookieHeader = request.headers.get("cookie") ?? "";
        return cookieHeader.split(";").map((c) => {
          const [name, ...v] = c.trim().split("=");
          return { name, value: v.join("=") };
        }).filter((c) => Boolean(c.name));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await supabase.rpc("accept_workspace_invitations");
      return response;
    }
  }

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      await supabase.rpc("accept_workspace_invitations");
      return response;
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=Unable%20to%20complete%20sign-in", url.origin),
  );
}
