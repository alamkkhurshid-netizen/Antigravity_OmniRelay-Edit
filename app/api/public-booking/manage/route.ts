import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Action="lookup"|"identity"|"cancel"|"reschedule";
type Input={
  action?:Action;reference?:string;token?:string;starts_at?:string;
  booking_contact_name?:string;booking_contact_phone?:string;
  patient_relationship?:string;patient_date_of_birth?:string|null;
};

const limits:Record<Action,{bucket:string;limit:number}>={
  lookup:{bucket:"public_booking_manage_lookup",limit:20},
  identity:{bucket:"public_booking_identity",limit:10},
  cancel:{bucket:"public_booking_cancel",limit:10},
  reschedule:{bucket:"public_booking_reschedule",limit:20},
};

function clientSignal(request:Request){
  return request.headers.get("cf-connecting-ip")
    ||request.headers.get("x-real-ip")
    ||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ||"unavailable";
}

function response(error:string,status:number){
  return NextResponse.json({error},{status,headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request){
  try{
    const input=await request.json() as Input;
    const action=input.action;
    const reference=String(input.reference??"").trim().toUpperCase();
    const token=String(input.token??"");
    if(!action||!limits[action]||!/^OMNI-[A-Z0-9]{8}$/.test(reference)||token.length<20){
      return response("Unable to access this booking.",400);
    }

    const admin=createAdminClient();
    const rule=limits[action];
    const {error:limitError}=await admin.rpc("consume_public_server_rate_limit",{
      p_bucket:rule.bucket,p_scope:reference,p_client_signal:clientSignal(request),
      p_limit:rule.limit,p_window_seconds:600,
    });
    if(limitError){
      const limited=/too many requests/i.test(limitError.message);
      return response(limited?"Too many requests. Please wait before trying again.":"Booking security is temporarily unavailable.",limited?429:503);
    }

    if(action==="lookup"){
      const {data,error}=await admin.rpc("get_customer_booking",{p_booking_reference:reference,p_manage_token:token});
      if(error||!data)return response("Unable to access this booking.",400);
      return NextResponse.json({booking:data},{headers:{"Cache-Control":"no-store"}});
    }
    if(action==="identity"){
      const {error}=await admin.rpc("attach_public_booking_identity",{
        p_booking_reference:reference,p_manage_token:token,
        p_booking_contact_name:String(input.booking_contact_name??""),
        p_booking_contact_phone:String(input.booking_contact_phone??""),
        p_patient_relationship:String(input.patient_relationship??""),
        p_patient_date_of_birth:input.patient_date_of_birth||null,
      });
      if(error)return response("Unable to update booking identity.",400);
    }else if(action==="cancel"){
      const {error}=await admin.rpc("cancel_customer_booking",{p_booking_reference:reference,p_manage_token:token});
      if(error)return response("Unable to cancel this booking.",400);
    }else{
      if(!input.starts_at||Number.isNaN(Date.parse(input.starts_at)))return response("Choose a valid appointment time.",400);
      const {error}=await admin.rpc("reschedule_customer_booking",{p_booking_reference:reference,p_manage_token:token,p_starts_at:input.starts_at});
      if(error)return response("Unable to reschedule this booking.",400);
    }
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch{return response("Unable to process this booking request.",400)}
}
