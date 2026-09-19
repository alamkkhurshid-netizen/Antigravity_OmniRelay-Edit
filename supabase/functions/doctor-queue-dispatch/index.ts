import {createClient} from "https://esm.sh/@supabase/supabase-js@2.54";
const url=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,serviceKey,{auth:{persistSession:false}});
const digits=(value:string)=>value.replace(/\D/g,"");
type Dispatch={id:string;organization_id:string;resource_id:string;availability_rule_id:string;shift_date:string;shift_starts_at:string;recipient_phone:string;booking_count:number;attempts:number;max_attempts:number};
async function release(item:Dispatch,reason:string,retryable=true){const exhausted=item.attempts>=item.max_attempts;await db.from("doctor_queue_dispatches").update({status:retryable&&!exhausted?"failed":"failed",next_attempt_at:retryable&&!exhausted?new Date(Date.now()+Math.min(60,item.attempts*10)*60000).toISOString():null,failure_reason:reason,updated_at:new Date().toISOString()}).eq("id",item.id).eq("status","processing");}
Deno.serve(async(request)=>{
  const token=request.headers.get("authorization")?.replace("Bearer ","");
  if(!token||token!==serviceKey)return Response.json({error:"Unauthorized"},{status:401});
  await db.rpc("materialize_due_doctor_queue_dispatches",{p_now:new Date().toISOString()});
  const {data:claimed,error}=await db.rpc("claim_due_doctor_queue_dispatches",{p_limit:20});
  if(error)return Response.json({error:error.message},{status:500});
  let queued=0,deferred=0,failed=0;
  for(const raw of claimed??[]){
    const item=raw as Dispatch;
    const [{data:resource},{data:rule},{data:organization},{data:template},{data:orgAddress}]=await Promise.all([
      db.from("booking_resources").select("name,provider_profiles(queue_notifications_enabled,whatsapp_queue_consent_at)").eq("id",item.resource_id).eq("organization_id",item.organization_id).single(),
      db.from("availability_rules").select("start_time,end_time,location:business_locations(name)").eq("id",item.availability_rule_id).eq("organization_id",item.organization_id).single(),
      db.from("organizations").select("name").eq("id",item.organization_id).single(),
      db.from("channel_message_templates").select("provider_template_name,language_code").eq("organization_id",item.organization_id).eq("event_type","doctor_queue").eq("status","approved").maybeSingle(),
      db.from("organizations_addresses").select("address").eq("organization_id",item.organization_id).eq("service","whatsapp").eq("status","connected").order("created_at",{ascending:false}).limit(1).maybeSingle(),
    ]);
    const profile=(resource as {provider_profiles?:{queue_notifications_enabled:boolean;whatsapp_queue_consent_at:string|null}|null}|null)?.provider_profiles;
    if(!resource||!rule||!organization||!profile?.queue_notifications_enabled||!profile.whatsapp_queue_consent_at){await release(item,"Doctor notification consent or shift configuration is no longer active.",false);failed++;continue;}
    if(!template||!orgAddress){await release(item,!template?"Approved Meta doctor_queue template is not configured.":"WhatsApp channel is not connected.",true);deferred++;continue;}
    const phone=digits(item.recipient_phone);if(!phone){await release(item,"Doctor WhatsApp number is invalid.",false);failed++;continue;}
    const shift=new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(item.shift_starts_at));
    const chamber=(rule as {location?:{name?:string}|null}).location?.name??"Clinic";
    let {data:contactAddress}=await db.from("contacts_addresses").select("contact_id,address").eq("organization_id",item.organization_id).eq("service","whatsapp").eq("address",phone).maybeSingle();
    if(!contactAddress){const {data:contact}=await db.from("contacts").insert({organization_id:item.organization_id,name:resource.name,status:"active"}).select("id").single();if(contact)contactAddress=(await db.from("contacts_addresses").insert({organization_id:item.organization_id,contact_id:contact.id,service:"whatsapp",address:phone,name:resource.name,status:"active",extra:{source:"doctor_queue",consent:true}}).select("contact_id,address").single()).data;}
    if(!contactAddress){await release(item,"Doctor messaging contact could not be prepared.");failed++;continue;}
    let {data:conversation}=await db.from("conversations").select("id").eq("organization_id",item.organization_id).eq("service","whatsapp").eq("organization_address",orgAddress.address).eq("contact_address",phone).maybeSingle();
    if(!conversation)conversation=(await db.from("conversations").insert({organization_id:item.organization_id,service:"whatsapp",organization_address:orgAddress.address,contact_address:phone,name:resource.name,status:"active",extra:{source:"doctor_queue"}}).select("id").single()).data;
    if(!conversation){await release(item,"Doctor conversation could not be prepared.");failed++;continue;}
    // Keep retries idempotent within an attempt while allowing a fresh
    // outbound message after Meta rejects a previous attempt.
    const key=`doctor-queue:${item.id}:attempt:${item.attempts}`;
    const {data:existing}=await db.from("messages").select("id").eq("organization_id",item.organization_id).contains("status",{omnirelay_dispatch_key:key}).maybeSingle();
    if(existing){await db.from("doctor_queue_dispatches").update({status:"queued",message_id:existing.id,next_attempt_at:null,failure_reason:null,updated_at:new Date().toISOString()}).eq("id",item.id);queued++;continue;}
    const {data:message,error:messageError}=await db.from("messages").insert({organization_id:item.organization_id,conversation_id:conversation.id,service:"whatsapp",organization_address:orgAddress.address,contact_address:phone,direction:"outgoing",content:{version:"1",type:"data",kind:"template",data:{name:template.provider_template_name,language:{code:template.language_code||"en"},components:[{type:"body",parameters:[{type:"text",text:resource.name},{type:"text",text:organization.name},{type:"text",text:`${shift} · ${chamber}`},{type:"text",text:String(item.booking_count)}]}]}},status:{pending:new Date().toISOString(),omnirelay_dispatch_key:key}}).select("id").single();
    if(messageError||!message){await release(item,messageError?.message||"Message could not be queued.");failed++;continue;}
    await db.from("doctor_queue_dispatches").update({status:"queued",message_id:message.id,next_attempt_at:null,failure_reason:null,provider_response:{queued:true,message_id:message.id},updated_at:new Date().toISOString()}).eq("id",item.id).eq("status","processing");queued++;
  }
  return Response.json({processed:claimed?.length??0,queued,deferred,failed});
});
