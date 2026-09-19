import { NextResponse } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

async function signature(message:string,secret:string) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)));
  return Array.from(bytes).map((value)=>value.toString(16).padStart(2,"0")).join("");
}
function constantTimeEqual(left:string,right:string) {
  if(left.length!==right.length)return false;
  let difference=0;
  for(let i=0;i<left.length;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);
  return difference===0;
}
async function rpc<T>(name:string,body:Record<string,unknown>):Promise<T> {
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:{"Content-Type":"application/json",apikey:supabasePublishableKey,Authorization:`Bearer ${supabasePublishableKey}`},
    body:JSON.stringify(body),cache:"no-store",
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||"Unable to confirm payment");
  return data as T;
}

export async function POST(request:Request) {
  const secret=process.env.RAZORPAY_KEY_SECRET;
  if(!secret)return NextResponse.json({error:"Payment verification is not configured"},{status:503});
  try {
    const input=await request.json() as Record<string,unknown>;
    const orderId=String(input.razorpay_order_id??"");
    const paymentId=String(input.razorpay_payment_id??"");
    const received=String(input.razorpay_signature??"");
    if(!orderId||!paymentId||!received)throw new Error("Incomplete Razorpay confirmation");
    const expected=await signature(`${orderId}|${paymentId}`,secret);
    if(!constantTimeEqual(expected,received))throw new Error("Payment signature verification failed");
    const confirmation=await rpc<Record<string,unknown>>("confirm_public_payment",{
      p_booking_reference:String(input.booking_reference??""),
      p_manage_token:String(input.manage_token??""),
      p_provider_order_id:orderId,p_provider_payment_id:paymentId,
    });
    return NextResponse.json(confirmation,{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to verify payment"},{status:400,headers:{"Cache-Control":"no-store"}});
  }
}
