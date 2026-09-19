import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54";
const url=Deno.env.get("SUPABASE_URL")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,serviceKey,{auth:{persistSession:false}});
type Recipient={id:string;campaign_id:string;organization_id:string;patient_id:string;recipient_address:string;consent_basis:string;campaign:{id:string;name:string;campaign_type:string;frequency_cap_hours:number;message_note:string|null;status:string;scheduled_for:string;audience_filter:Record<string,unknown>|null;template:{provider_template_name:string;language_code:string;status:string}};patient:{full_name:string;care_communications_consent:boolean;marketing_consent:boolean}};
const digits=(v:string)=>v.replace(/\D/g,"");
const doctorLabel=(name:string)=>/^dr\b/i.test(name.trim())?name.trim():`Dr ${name.trim()}`;

Deno.serve(async(req)=>{
 const token=req.headers.get("authorization")?.replace("Bearer ","");
 if(!token||token!==serviceKey)return Response.json({error:"Unauthorized"},{status:401});
 const now=new Date().toISOString();
 const {data,error}=await db.from("campaign_recipients")
  .select("id,campaign_id,organization_id,patient_id,recipient_address,consent_basis,campaign:campaigns!inner(id,name,campaign_type,frequency_cap_hours,message_note,status,scheduled_for,audience_filter,template:channel_message_templates!inner(provider_template_name,language_code,status)),patient:patient_profiles!inner(full_name,care_communications_consent,marketing_consent)")
  .eq("status","approved").lte("scheduled_for",now).in("campaign.status",["scheduled","running"]).eq("campaign.template.status","approved")
  .order("scheduled_for").limit(50);
 if(error)return Response.json({error:error.message},{status:500});
 let queued=0,skipped=0,failed=0;
 for(const raw of data??[]){
  const r=raw as unknown as Recipient,p=r.patient,c=r.campaign,address=digits(r.recipient_address);
  const consent=r.consent_basis==="marketing"?p.marketing_consent:p.care_communications_consent;
  const {data:out}=await db.from("communication_opt_outs").select("id,address").eq("organization_id",r.organization_id).eq("channel","whatsapp").in("scope",["all",r.consent_basis==="marketing"?"marketing":"care"]).limit(100);
  const optedOut=(out??[]).some((item)=>digits(item.address)===address);
  if(!consent||optedOut){await db.from("campaign_recipients").update({status:optedOut?"opted_out":"skipped",failure_reason:optedOut?"Current WhatsApp opt-out.":"Current consent is not active.",updated_at:now}).eq("id",r.id);skipped++;continue}
  let templateContext=c.message_note||c.name;
  if(c.campaign_type==="emergency"){
   const locationId=String(c.audience_filter?.location_id??""),resourceId=String(c.audience_filter?.resource_id??""),appointmentDate=String(c.audience_filter?.appointment_date??""),action=String(c.audience_filter?.action??"");
   if(!locationId||!resourceId||!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate)||!["reschedule_required","notify_only"].includes(action)){await db.from("campaign_recipients").update({status:"failed",failure_reason:"Doctor-specific emergency audience scope is incomplete.",updated_at:now}).eq("id",r.id);failed++;continue}
   const {data:affected,error:affectedError}=await db.from("appointments").select("id").eq("organization_id",r.organization_id).eq("patient_id",r.patient_id).eq("location_id",locationId).eq("resource_id",resourceId).gte("starts_at",`${appointmentDate}T00:00:00+05:30`).lt("starts_at",`${appointmentDate}T23:59:59+05:30`).in("status",["pending","payment_pending","confirmed","arrived","rescheduling_required"]).limit(1);
   if(affectedError){await db.from("campaign_recipients").update({status:"failed",failure_reason:"Affected appointment could not be rechecked.",updated_at:now}).eq("id",r.id);failed++;continue}
   if(!affected?.length){await db.from("campaign_recipients").update({status:"skipped",failure_reason:"Patient is no longer affected by this doctor-specific emergency.",updated_at:now}).eq("id",r.id);skipped++;continue}
   const {data:resource,error:resourceError}=await db.from("booking_resources").select("name").eq("id",resourceId).eq("organization_id",r.organization_id).eq("status","active").maybeSingle();
   if(resourceError||!resource?.name){await db.from("campaign_recipients").update({status:"failed",failure_reason:"Affected doctor could not be verified before sending.",updated_at:now}).eq("id",r.id);failed++;continue}
   templateContext=`${doctorLabel(resource.name)} is unavailable. ${c.message_note?.trim()||"Please contact the clinic for assistance."}`;
  }
  if(c.campaign_type!=="emergency"&&c.frequency_cap_hours>0){
   const cutoff=new Date(Date.now()-c.frequency_cap_hours*60*60*1000).toISOString();
   const {data:recent,error:recentError}=await db.from("campaign_recipients").select("id").eq("organization_id",r.organization_id).eq("patient_id",r.patient_id).neq("campaign_id",c.id).in("status",["sent","delivered","read"]).gte("sent_at",cutoff).limit(1);
   if(recentError){await db.from("campaign_recipients").update({status:"failed",failure_reason:recentError.message,updated_at:now}).eq("id",r.id);failed++;continue}
   if(recent?.length){await db.from("campaign_recipients").update({status:"skipped",failure_reason:`Frequency cap: another campaign was sent within ${c.frequency_cap_hours} hours.`,updated_at:now}).eq("id",r.id);skipped++;continue}
  }
  const {data:orgAddress}=await db.from("organizations_addresses").select("address").eq("organization_id",r.organization_id).eq("service","whatsapp").eq("status","connected").order("created_at",{ascending:false}).limit(1).maybeSingle();
  const {data:org}=await db.from("organizations").select("name").eq("id",r.organization_id).single();
  if(!orgAddress){await db.from("campaign_recipients").update({status:"failed",failure_reason:"WhatsApp channel is not connected.",updated_at:now}).eq("id",r.id);failed++;continue}
  let {data:contactAddress}=await db.from("contacts_addresses").select("contact_id").eq("organization_id",r.organization_id).eq("service","whatsapp").eq("address",address).maybeSingle();
  if(!contactAddress){const {data:contact}=await db.from("contacts").insert({organization_id:r.organization_id,name:p.full_name,status:"active"}).select("id").single();if(contact){const made=await db.from("contacts_addresses").insert({organization_id:r.organization_id,contact_id:contact.id,service:"whatsapp",address,name:p.full_name,status:"active",extra:{source:"campaign",consent:true}}).select("contact_id").single();contactAddress=made.data}}
  if(!contactAddress){await db.from("campaign_recipients").update({status:"failed",failure_reason:"Messaging contact could not be prepared.",updated_at:now}).eq("id",r.id);failed++;continue}
  let {data:conversation}=await db.from("conversations").select("id").eq("organization_id",r.organization_id).eq("service","whatsapp").eq("organization_address",orgAddress.address).eq("contact_address",address).maybeSingle();
  if(!conversation){const made=await db.from("conversations").insert({organization_id:r.organization_id,service:"whatsapp",organization_address:orgAddress.address,contact_address:address,name:p.full_name,status:"active",extra:{source:"campaign",campaign_id:c.id}}).select("id").single();conversation=made.data}
  if(!conversation){await db.from("campaign_recipients").update({status:"failed",failure_reason:"Conversation could not be prepared.",updated_at:now}).eq("id",r.id);failed++;continue}
  const {data:message,error:messageError}=await db.from("messages").insert({organization_id:r.organization_id,conversation_id:conversation.id,service:"whatsapp",organization_address:orgAddress.address,contact_address:address,direction:"outgoing",content:{version:"1",type:"data",kind:"template",data:{name:c.template.provider_template_name,language:{code:c.template.language_code||"en"},components:[{type:"body",parameters:[{type:"text",text:p.full_name},{type:"text",text:org?.name||"Your clinic"},{type:"text",text:templateContext}]}]}},status:{pending:now}}).select("id").single();
  if(messageError||!message){await db.from("campaign_recipients").update({status:"failed",failure_reason:messageError?.message||"Message could not be queued.",updated_at:now}).eq("id",r.id);failed++;continue}
  await db.from("campaign_recipients").update({status:"queued",message_id:message.id,failure_reason:null,updated_at:now}).eq("id",r.id);
  await db.from("campaigns").update({status:"running",updated_at:now}).eq("id",c.id).eq("status","scheduled");
  queued++;
 }
 return Response.json({processed:data?.length??0,queued,skipped,failed});
});
