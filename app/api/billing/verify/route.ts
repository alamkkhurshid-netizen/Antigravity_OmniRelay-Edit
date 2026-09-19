import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getWorkspace } from "@/lib/workspace";
import { supabaseUrl } from "@/lib/supabase/config";

async function hmac(message:string,secret:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)));return Array.from(bytes).map(v=>v.toString(16).padStart(2,"0")).join("");}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}

export async function POST(request:Request){
  const keyId=process.env.RAZORPAY_KEY_ID;const secret=process.env.RAZORPAY_KEY_SECRET;const serviceKey=process.env.SUPABASE_SECRET_KEY;
  if(!keyId||!secret||!serviceKey)return NextResponse.json({error:"Payment verification is not configured."},{status:503});
  const {supabase,organization}=await getWorkspace();const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});if(!organization)return NextResponse.json({error:"Workspace not found."},{status:409});
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;const orderId=String(body.razorpay_order_id??"");const paymentId=String(body.razorpay_payment_id??"");const signature=String(body.razorpay_signature??"");
  if(!orderId||!paymentId||!signature)return NextResponse.json({error:"Incomplete payment confirmation."},{status:400});
  if(!safeEqual(await hmac(`${orderId}|${paymentId}`,secret),signature))return NextResponse.json({error:"Payment signature verification failed."},{status:400});
  const admin=createAdminClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:order}=await admin.from("saas_billing_orders").select("organization_id,amount_paise,currency").eq("provider_order_id",orderId).maybeSingle();
  if(!order||order.organization_id!==organization.id)return NextResponse.json({error:"This payment does not belong to your workspace."},{status:403});
  const auth=`Basic ${btoa(`${keyId}:${secret}`)}`;
  const [orderResponse,paymentResponse]=await Promise.all([fetch(`https://api.razorpay.com/v1/orders/${orderId}`,{headers:{Authorization:auth}}),fetch(`https://api.razorpay.com/v1/payments/${paymentId}`,{headers:{Authorization:auth}})]);
  const [providerOrder,providerPayment]=await Promise.all([orderResponse.json(),paymentResponse.json()]);
  if(!orderResponse.ok||!paymentResponse.ok||providerOrder.status!=="paid"||providerPayment.status!=="captured")return NextResponse.json({error:"Razorpay has not confirmed a captured payment yet."},{status:409});
  if(Number(providerOrder.amount_paid)!==order.amount_paise||String(providerOrder.currency)!==order.currency)return NextResponse.json({error:"Payment amount or currency mismatch."},{status:400});
  const {data,error}=await admin.rpc("activate_saas_subscription",{p_provider_order_id:orderId,p_provider_payment_id:paymentId});
  if(error)return NextResponse.json({error:error.message},{status:400});return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}
