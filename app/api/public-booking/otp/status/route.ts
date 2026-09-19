import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request:Request) {
  const slug=new URL(request.url).searchParams.get("slug")?.trim().toLowerCase();
  if(!slug)return NextResponse.json({available:false},{headers:{"Cache-Control":"no-store"}});
  const admin=createAdminClient();
  const {data:page}=await admin.from("booking_pages").select("organization_id").eq("slug",slug).eq("active",true).maybeSingle();
  if(!page)return NextResponse.json({available:false},{headers:{"Cache-Control":"no-store"}});
  const [{data:template},{data:connection}]=await Promise.all([
    admin.from("channel_message_templates").select("id").eq("organization_id",page.organization_id).eq("channel","whatsapp").eq("event_type","booking_otp").eq("status","approved").maybeSingle(),
    admin.from("channel_connections").select("id").eq("organization_id",page.organization_id).eq("channel","whatsapp").in("status",["test","live"]).maybeSingle(),
  ]);
  return NextResponse.json({available:Boolean(template&&connection)},{headers:{"Cache-Control":"no-store"}});
}
