import { NextResponse } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

type PaymentIntent = {
  booking_reference:string;manage_token:string;amount_paise:number;currency:string;
  expires_at:string;starts_at:string;ends_at:string;payment_mode:string;
};
type RazorpayOrder = { id:string;amount:number;currency:string;status:string };

async function rpc<T>(name:string,body:Record<string,unknown>):Promise<T> {
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:{"Content-Type":"application/json",apikey:supabasePublishableKey,Authorization:`Bearer ${supabasePublishableKey}`},
    body:JSON.stringify(body),
    cache:"no-store",
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||"Unable to reserve this appointment");
  return data as T;
}

export async function POST(request:Request) {
  const keyId=process.env.RAZORPAY_KEY_ID;
  const keySecret=process.env.RAZORPAY_KEY_SECRET;
  if(!keyId||!keySecret)return NextResponse.json({error:"Online payment is not configured"},{status:503});
  try {
    const input=await request.json() as Record<string,unknown>;
    const intentArgs={
      p_slug:String(input.slug??""),p_resource_id:String(input.resource_id??""),
      p_location_id:String(input.location_id??""),p_service_id:String(input.service_id??""),
      p_customer_name:String(input.customer_name??"").slice(0,120),
      p_customer_phone:String(input.customer_phone??"").slice(0,40),
      p_customer_email:String(input.customer_email??"").slice(0,180),
      p_starts_at:String(input.starts_at??""),p_notes:String(input.notes??"").slice(0,500),
      p_selected_payment_mode:String(input.selected_payment_mode??""),
      p_intake:{
        age:String(input.age??"").slice(0,3),
        health_concern:String(input.health_concern??"").slice(0,240),
        locality:String(input.locality??"").slice(0,120),
        pincode:String(input.pincode??"").slice(0,6),
        summary:String(input.summary??"").slice(0,800),
        care_communications_consent:input.care_communications_consent===true,
        marketing_consent:input.marketing_consent===true,
      },
    };
    const handoffToken=String(input.handoff_token??"");
    const intent=handoffToken
      ?(await createAdminClient().rpc("create_whatsapp_handoff_payment_intent",{
        ...intentArgs,p_handoff_token:handoffToken,
        p_booking_contact_name:String(input.booking_contact_name??"").slice(0,120),
        p_booking_contact_phone:String(input.booking_contact_phone??"").slice(0,40),
        p_patient_relationship:String(input.patient_relationship??"self"),
        p_patient_date_of_birth:input.patient_date_of_birth||null,
      })).data as PaymentIntent
      :await rpc<PaymentIntent>("create_public_payment_intent_v3",intentArgs);
    if(!intent)throw new Error("Unable to reserve this appointment");
    const orderResponse=await fetch("https://api.razorpay.com/v1/orders",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Basic ${btoa(`${keyId}:${keySecret}`)}`},
      body:JSON.stringify({
        amount:intent.amount_paise,currency:intent.currency,receipt:intent.booking_reference,
        notes:{booking_reference:intent.booking_reference,source:"OmniRelay"},
      }),
    });
    const orderData=await orderResponse.json().catch(()=>null) as RazorpayOrder&{error?:{description?:string}};
    if(!orderResponse.ok||!orderData?.id)throw new Error(orderData?.error?.description||"Razorpay could not create the payment order");
    await rpc<void>("attach_public_payment_order",{
      p_booking_reference:intent.booking_reference,p_manage_token:intent.manage_token,p_provider_order_id:orderData.id,
    });
    return NextResponse.json({
      key_id:keyId,order_id:orderData.id,amount:intent.amount_paise,currency:intent.currency,
      booking_reference:intent.booking_reference,manage_token:intent.manage_token,
      expires_at:intent.expires_at,starts_at:intent.starts_at,ends_at:intent.ends_at,
    },{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Unable to start payment"},{status:400,headers:{"Cache-Control":"no-store"}});
  }
}
