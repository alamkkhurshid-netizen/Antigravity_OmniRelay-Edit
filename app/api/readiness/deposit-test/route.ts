import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit, recordOperationalError, recordTeamAudit } from "@/lib/operations";

export async function POST() {
  const keyId=process.env.RAZORPAY_KEY_ID,keySecret=process.env.RAZORPAY_KEY_SECRET;
  if(!keyId||!keySecret)return NextResponse.json({error:"Razorpay test checkout is not configured."},{status:503});
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const { data: actor } = await supabase.from("agents").select("id,extra").eq("organization_id",organization.id).eq("user_id",user.id).eq("ai",false).maybeSingle();
  const role=String((actor?.extra as Record<string,unknown>|null)?.role??"member");
  if(!actor||!["owner","admin"].includes(role))return NextResponse.json({error:"Only a workspace owner or admin can prepare this test."},{status:403});
  if(!await consumeRateLimit(supabase,"deposit_acceptance_prepare",3,3600))return NextResponse.json({error:"The controlled test preparation limit was reached."},{status:429});
  const admin=createAdminClient();
  const {data,error}=await admin.rpc("prepare_deposit_acceptance_test",{p_organization_id:organization.id});
  if(error||!data){
    await recordOperationalError({organizationId:organization.id,actorUserId:user.id,source:"acceptance.deposit",code:"DEPOSIT_TEST_PREPARE_FAILED",safeMessage:"The controlled deposit test could not be prepared."});
    return NextResponse.json({error:error?.message??"The controlled deposit test could not be prepared."},{status:400});
  }
  const {data:gateway}=await supabase.from("payment_gateway_connections").select("status").eq("organization_id",organization.id).eq("provider","razorpay").maybeSingle();
  if(gateway?.status!=="test")return NextResponse.json({error:"The controlled ₹1 fixture requires Razorpay test mode."},{status:409});
  const token=crypto.randomUUID()+crypto.randomUUID();
  const tokenHash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)));
  const {data:fixture,error:fixtureError}=await admin.from("whatsapp_acceptance_payments").upsert({organization_id:organization.id,run_id:data.id,amount_paise:100,currency:"INR",status:"created",access_token_hash:"\\x"+Array.from(tokenHash).map(value=>value.toString(16).padStart(2,"0")).join(""),expires_at:data.expires_at,updated_at:new Date().toISOString()},{onConflict:"run_id"}).select("id").single();
  if(fixtureError||!fixture)return NextResponse.json({error:fixtureError?.message??"Synthetic payment fixture could not be created."},{status:400});
  const orderResponse=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Basic ${btoa(`${keyId}:${keySecret}`)}`},body:JSON.stringify({amount:100,currency:"INR",receipt:`OA-${fixture.id.slice(0,20)}`,notes:{source:"OmniRelay acceptance",fixture_id:fixture.id}})});
  const order=await orderResponse.json().catch(()=>null) as {id?:string;error?:{description?:string}}|null;
  if(!orderResponse.ok||!order?.id){await admin.from("whatsapp_acceptance_payments").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",fixture.id);return NextResponse.json({error:order?.error?.description??"Razorpay test order could not be created."},{status:400});}
  const checkoutUrl=`https://omnirelay-light.alam-kkhurshid.chatgpt.site/pay/${encodeURIComponent(token)}`;
  await Promise.all([admin.from("whatsapp_acceptance_payments").update({provider_order_id:order.id,updated_at:new Date().toISOString()}).eq("id",fixture.id),admin.from("whatsapp_acceptance_test_runs").update({subject_acceptance_payment_id:fixture.id,checkout_url:checkoutUrl,updated_at:new Date().toISOString()}).eq("id",data.id).eq("organization_id",organization.id)]);
  await recordTeamAudit({organizationId:organization.id,actorUserId:user.id,eventType:"deposit_acceptance_prepared",summary:"Controlled ₹1 deposit acceptance test prepared",metadata:{scenario_key:"deposit_payment",max_messages:1,fixture_id:fixture.id}});
  return NextResponse.json({run:{scenario_key:data.scenario_key,status:data.status,recipient_last4:data.recipient_last4,max_messages:data.max_messages,message_count:data.message_count,expires_at:data.expires_at}},{headers:{"Cache-Control":"no-store"}});
}
