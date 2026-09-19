import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request:Request){
  try{
    const input=await request.json() as Record<string,unknown>;
    const admin=createAdminClient();
    if(input.action==="complete"){
      const {data,error}=await admin.rpc("complete_whatsapp_booking_handoff",{
        p_handoff_token:String(input.handoff_token??""),p_booking_reference:String(input.booking_reference??""),p_manage_token:String(input.manage_token??"")
      });
      if(error||data!==true)throw new Error(error?.message||"WhatsApp confirmation could not be sent");
      return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    }
    const {data,error}=await admin.rpc("create_whatsapp_handoff_appointment",{
      p_handoff_token:String(input.handoff_token??""),p_slug:String(input.slug??""),
      p_resource_id:String(input.resource_id??""),p_location_id:String(input.location_id??""),p_service_id:String(input.service_id??""),
      p_customer_name:String(input.customer_name??"").slice(0,120),p_customer_phone:String(input.customer_phone??"").slice(0,40),
      p_customer_email:String(input.customer_email??"").slice(0,180),p_starts_at:String(input.starts_at??""),
      p_booking_contact_name:String(input.booking_contact_name??"").slice(0,120),p_booking_contact_phone:String(input.booking_contact_phone??"").slice(0,40),
      p_patient_relationship:String(input.patient_relationship??""),p_patient_date_of_birth:input.patient_date_of_birth||null,
      p_notes:String(input.notes??"").slice(0,500),p_intake:input.intake??{}
    });
    if(error||!data)throw new Error(error?.message||"WhatsApp booking could not be completed");
    const result=data as Record<string,unknown>;
    let {data:completed,error:completeError}=await admin.rpc("complete_whatsapp_booking_handoff",{
      p_handoff_token:String(input.handoff_token??""),p_booking_reference:String(result.booking_reference??""),p_manage_token:String(result.manage_token??"")
    });
    let finalResult=result;
    if(completeError||completed!==true){
      const {data:recovered,error:recoveryError}=await admin.rpc("create_whatsapp_handoff_appointment",{
        p_handoff_token:String(input.handoff_token??""),p_slug:String(input.slug??""),
        p_resource_id:String(input.resource_id??""),p_location_id:String(input.location_id??""),p_service_id:String(input.service_id??""),
        p_customer_name:String(input.customer_name??"").slice(0,120),p_customer_phone:String(input.customer_phone??"").slice(0,40),
        p_customer_email:String(input.customer_email??"").slice(0,180),p_starts_at:String(input.starts_at??""),
        p_booking_contact_name:String(input.booking_contact_name??"").slice(0,120),p_booking_contact_phone:String(input.booking_contact_phone??"").slice(0,40),
        p_patient_relationship:String(input.patient_relationship??""),p_patient_date_of_birth:input.patient_date_of_birth||null,
        p_notes:String(input.notes??"").slice(0,500),p_intake:input.intake??{}
      });
      if(recoveryError||!recovered)throw new Error(recoveryError?.message||completeError?.message||"Appointment created, but recovery failed");
      finalResult=recovered as Record<string,unknown>;
      ({data:completed,error:completeError}=await admin.rpc("complete_whatsapp_booking_handoff",{
        p_handoff_token:String(input.handoff_token??""),p_booking_reference:String(finalResult.booking_reference??""),p_manage_token:String(finalResult.manage_token??"")
      }));
      if(completeError||completed!==true)throw new Error(completeError?.message||"Appointment created, but WhatsApp confirmation recovery failed");
    }
    return NextResponse.json(finalResult,{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to complete WhatsApp booking"},{status:400,headers:{"Cache-Control":"no-store"}})}
}
