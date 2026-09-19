import { NextResponse } from "next/server";
import { supabaseUrl } from "@/lib/supabase/config";

function equalBytes(left:Uint8Array,right:Uint8Array) {
  if(left.length!==right.length)return false;
  let difference=0;
  for(let index=0;index<left.length;index++)difference|=left[index]^right[index];
  return difference===0;
}
async function validSignature(body:string,signature:string,secret:string) {
  if(!signature.startsWith("sha256="))return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));
  const received=Uint8Array.from((signature.slice(7).match(/.{1,2}/g)??[]).map((value)=>Number.parseInt(value,16)));
  return equalBytes(digest,received);
}
async function adminUpdate(providerMessageId:string,status:string,timestamp?:string) {
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!secret)return;
  const patch:Record<string,unknown>={status,status_provider:status,updated_at:new Date().toISOString()};
  if(status==="sent")patch.sent_at=timestamp?new Date(Number(timestamp)*1000).toISOString():new Date().toISOString();
  if(status==="delivered")patch.delivered_at=timestamp?new Date(Number(timestamp)*1000).toISOString():new Date().toISOString();
  if(status==="read")patch.read_at=timestamp?new Date(Number(timestamp)*1000).toISOString():new Date().toISOString();
  if(status==="failed")patch.status="failed";
  else patch.status="sent";
  delete patch.status_provider;
  await fetch(`${supabaseUrl}/rest/v1/reminder_events?provider_message_id=eq.${encodeURIComponent(providerMessageId)}`,{
    method:"PATCH",headers:{"Content-Type":"application/json",apikey:secret,Authorization:`Bearer ${secret}`,Prefer:"return=minimal"},body:JSON.stringify(patch),
  });

  // Active Billing Deduction Check (Inactive by default)
  if (process.env.ENABLE_ACTIVE_BILLING === "true" && (status === "sent" || status === "delivered")) {
    try {
      // 1. We need to look up the organization_id from the reminder event
      const res = await fetch(`${supabaseUrl}/rest/v1/reminder_events?provider_message_id=eq.${encodeURIComponent(providerMessageId)}&select=organization_id,event_type`, {
        headers: {apikey: secret, Authorization: `Bearer ${secret}`}
      });
      const events = await res.json();
      
      if (events && events.length > 0) {
        const orgId = events[0].organization_id;
        // For now, reminder events are all 'utility' category.
        const category = "utility"; 
        
        // 2. Execute the atomic deduction RPC
        await fetch(`${supabaseUrl}/rpc/record_and_deduct`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: secret, Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            p_organization_id: orgId,
            p_meta_message_id: providerMessageId,
            p_category: category
          })
        });
      }
    } catch (e) {
      console.error("Active Billing Deduction failed:", e);
    }
  }
}

export async function GET(request:Request) {
  const url=new URL(request.url);
  const mode=url.searchParams.get("hub.mode");
  const token=url.searchParams.get("hub.verify_token");
  const challenge=url.searchParams.get("hub.challenge");
  if(mode==="subscribe"&&token&&challenge&&token===process.env.WHATSAPP_VERIFY_TOKEN)return new Response(challenge,{status:200});
  return new Response("Verification failed",{status:403});
}

export async function POST(request:Request) {
  const body=await request.text();
  const signature=request.headers.get("x-hub-signature-256")??"";
  const appSecret=process.env.WHATSAPP_APP_SECRET;
  if(!appSecret||!(await validSignature(body,signature,appSecret)))return NextResponse.json({error:"Invalid signature"},{status:401});
  const payload=JSON.parse(body) as {entry?:Array<{changes?:Array<{value?:{statuses?:Array<{id?:string;status?:string;timestamp?:string}>}}>}>};
  const statuses=payload.entry?.flatMap((entry)=>entry.changes?.flatMap((change)=>change.value?.statuses??[])??[])??[];
  await Promise.all(statuses.filter((item)=>item.id&&item.status).map((item)=>adminUpdate(item.id!,item.status!,item.timestamp)));
  return NextResponse.json({received:true});
}
