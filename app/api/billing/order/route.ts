import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getWorkspace } from "@/lib/workspace";
import { supabaseUrl } from "@/lib/supabase/config";
import { consumeRateLimit } from "@/lib/operations";

export async function POST(request: Request) {
  const keyId=process.env.RAZORPAY_KEY_ID;
  const keySecret=process.env.RAZORPAY_KEY_SECRET;
  const serviceKey=process.env.SUPABASE_SECRET_KEY;
  if(!keyId||!keySecret||!serviceKey)return NextResponse.json({error:"Billing checkout is not configured."},{status:503});
  const {supabase,organization}=await getWorkspace();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(!organization)return NextResponse.json({error:"Workspace not found."},{status:409});
  if(!await consumeRateLimit(supabase,"billing_order",10,3600))return NextResponse.json({error:"Too many billing attempts. Please try again later."},{status:429});
  const {data:agent}=await supabase.from("agents").select("id,extra").eq("organization_id",organization.id).eq("user_id",user.id).eq("ai",false).maybeSingle();
  const role=String((agent?.extra as Record<string,unknown>|null)?.role??"member");
  if(!agent||!["owner","admin"].includes(role))return NextResponse.json({error:"Only a workspace owner or admin can manage billing."},{status:403});

  const input=await request.json().catch(()=>({})) as {plan_id?:string};
  const admin=createAdminClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:plan}=await admin.from("saas_plans").select("id,name,monthly_price_paise,currency").eq("id",String(input.plan_id??"")).eq("active",true).maybeSingle();
  if(!plan)return NextResponse.json({error:"Select an available plan."},{status:400});
  const receipt=`OR-${organization.id.slice(0,8)}-${Date.now().toString(36)}`.slice(0,40);
  const {data:billingOrder,error:insertError}=await admin.from("saas_billing_orders").insert({organization_id:organization.id,plan_id:plan.id,created_by:user.id,amount_paise:plan.monthly_price_paise,currency:plan.currency,receipt,metadata:{source:"workspace_checkout"}}).select("id").single();
  if(insertError||!billingOrder)return NextResponse.json({error:insertError?.message??"Could not create billing order."},{status:400});
  const response=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Basic ${btoa(`${keyId}:${keySecret}`)}`},body:JSON.stringify({amount:plan.monthly_price_paise,currency:plan.currency,receipt,notes:{billing_order_id:billingOrder.id,organization_id:organization.id,plan_id:plan.id,source:"OmniRelay SaaS"}})});
  const result=await response.json().catch(()=>null) as {id?:string;error?:{description?:string}}|null;
  if(!response.ok||!result?.id){await admin.from("saas_billing_orders").update({status:"failed",failure_reason:result?.error?.description??"Provider order failed"}).eq("id",billingOrder.id);return NextResponse.json({error:result?.error?.description??"Razorpay could not create this order."},{status:400});}
  await admin.from("saas_billing_orders").update({provider_order_id:result.id}).eq("id",billingOrder.id);
  return NextResponse.json({key_id:keyId,order_id:result.id,amount:plan.monthly_price_paise,currency:plan.currency,plan_name:plan.name,billing_order_id:billingOrder.id},{headers:{"Cache-Control":"no-store"}});
}
