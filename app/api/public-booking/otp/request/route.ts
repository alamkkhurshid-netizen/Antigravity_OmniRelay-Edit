import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Challenge={challenge_id:string;organization_id:string;normalized_phone:string;otp_code:string;expires_in:number};
export async function POST(request:Request) {
  try{
    const input=await request.json() as {slug?:string;phone?:string};const admin=createAdminClient();
    const {data,error}=await admin.rpc("create_booking_phone_otp_challenge",{p_slug:String(input.slug??""),p_phone:String(input.phone??"")});
    if(error||!data)throw new Error(error?.message||"Unable to create verification code");
    const challenge=data as Challenge;const phone=challenge.normalized_phone.replace(/\D/g,"");
    const [{data:template},{data:connection}]=await Promise.all([
      admin.from("channel_message_templates").select("provider_template_name,language_code").eq("organization_id",challenge.organization_id).eq("channel","whatsapp").eq("event_type","booking_otp").eq("status","approved").single(),
      admin.from("channel_connections").select("external_phone_number_id").eq("organization_id",challenge.organization_id).eq("channel","whatsapp").in("status",["test","live"]).single(),
    ]);
    if(!template||!connection)throw new Error("WhatsApp verification is not configured");
    let {data:conversation}=await admin.from("conversations").select("id").eq("organization_id",challenge.organization_id).eq("service","whatsapp").eq("organization_address",connection.external_phone_number_id).eq("contact_address",phone).eq("status","active").maybeSingle();
    if(!conversation){const made=await admin.from("conversations").insert({organization_id:challenge.organization_id,service:"whatsapp",organization_address:connection.external_phone_number_id,contact_address:phone,name:"Booking verification",status:"active",ai_paused:true,extra:{source:"booking_otp"}}).select("id").single();conversation=made.data;}
    if(!conversation)throw new Error("Unable to prepare WhatsApp verification");
    const {error:messageError}=await admin.from("messages").insert({organization_id:challenge.organization_id,conversation_id:conversation.id,service:"whatsapp",organization_address:connection.external_phone_number_id,contact_address:phone,direction:"outgoing",content:{version:"1",type:"data",kind:"template",text:"Booking verification code",data:{name:template.provider_template_name,language:{code:template.language_code||"en"},components:[{type:"body",parameters:[{type:"text",text:challenge.otp_code}]},{type:"button",sub_type:"url",index:"0",parameters:[{type:"text",text:challenge.otp_code}]}],meta:{purpose:"booking_otp",challenge_id:challenge.challenge_id}}},status:{status:"queued",source:"booking_otp"}});
    if(messageError)throw new Error(messageError.message);
    return NextResponse.json({challenge_id:challenge.challenge_id,expires_in:challenge.expires_in},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to send verification code"},{status:400,headers:{"Cache-Control":"no-store"}})}
}
