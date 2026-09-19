import {createClient} from "https://esm.sh/@supabase/supabase-js@2.54";
const url=Deno.env.get("SUPABASE_URL")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,serviceKey,{auth:{persistSession:false}});
const digits=(value:string)=>value.replace(/\D/g,"");

Deno.serve(async(request)=>{
  const token=request.headers.get("authorization")?.replace("Bearer ","");
  if(!token||token!==serviceKey)return Response.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>({})) as {organization_id?:string};
  if(!body.organization_id)return Response.json({error:"Organization is required"},{status:400});
  const {data:run,error:claimError}=await db.rpc("claim_deposit_acceptance_dispatch",{p_organization_id:body.organization_id});
  if(claimError)return Response.json({error:claimError.message},{status:400});
  if(!run?.id)return Response.json({processed:0,queued:0});
  const fail=async(reason:string)=>{await db.rpc("complete_deposit_acceptance_dispatch",{p_run_id:run.id,p_lease_token:run.lease_token,p_passed:false,p_evidence_reference:"deposit-dispatch-preflight",p_failure_summary:reason});return Response.json({processed:1,queued:0,error:reason},{status:409})};
  const [{data:verified},{data:template},{data:connection},{data:organization}]=await Promise.all([
    db.from("messages").select("contact_address,conversation_id,status").eq("id",run.verified_message_id).eq("organization_id",run.organization_id).maybeSingle(),
    db.from("channel_message_templates").select("provider_template_name,language_code,status").eq("organization_id",run.organization_id).eq("event_type","payment_action").eq("status","approved").maybeSingle(),
    db.from("channel_connections").select("external_phone_number_id,status").eq("organization_id",run.organization_id).eq("channel","whatsapp").eq("status","live").maybeSingle(),
    db.from("organizations").select("name").eq("id",run.organization_id).single(),
  ]);
  const deliveryStatus=verified?.status as Record<string,unknown>|null;
  if(!verified||!deliveryStatus?.delivered||!template||!connection?.external_phone_number_id||!organization)return fail("Verified recipient, approved payment template, or live WhatsApp connection is unavailable.");
  const phone=digits(verified.contact_address??"");
  if(!phone||!run.recipient_last4||!phone.endsWith(run.recipient_last4))return fail("Verified recipient identity no longer matches.");
  const key=`deposit-acceptance:${run.id}`;
  const {data:existing}=await db.from("messages").select("id").eq("organization_id",run.organization_id).contains("status",{omnirelay_dispatch_key:key}).maybeSingle();
  if(existing){await db.from("whatsapp_acceptance_test_runs").update({dispatch_message_id:existing.id,updated_at:new Date().toISOString()}).eq("id",run.id);return Response.json({processed:1,queued:1,idempotent:true});}
  const checkout=new URL(run.checkout_url);
  const buttonSuffix=checkout.pathname.split("/").filter(Boolean).at(-1)??"";
  if(!buttonSuffix||checkout.pathname.split("/").filter(Boolean).at(-2)!=="pay")return fail("The controlled checkout link does not match the approved opaque payment route.");
  const {data:message,error:messageError}=await db.from("messages").insert({organization_id:run.organization_id,conversation_id:verified.conversation_id,service:"whatsapp",organization_address:connection.external_phone_number_id,contact_address:phone,direction:"outgoing",content:{version:"1",type:"data",kind:"template",data:{name:template.provider_template_name,language:{code:template.language_code||"en"},components:[{type:"body",parameters:[{type:"text",text:"Synthetic Patient"},{type:"text",text:organization.name},{type:"text",text:"₹1.00"},{type:"text",text:"Deposit test"},{type:"text",text:"TEST-BOOKING"},{type:"text",text:"30 minutes"}]},{type:"button",sub_type:"url",index:"0",parameters:[{type:"text",text:buttonSuffix}]}]}},status:{pending:new Date().toISOString(),omnirelay_dispatch_key:key,acceptance_run_id:run.id,purpose:"deposit_acceptance"}}).select("id").single();
  if(messageError||!message)return fail("The controlled payment prompt could not be queued.");
  await db.from("whatsapp_acceptance_test_runs").update({dispatch_message_id:message.id,updated_at:new Date().toISOString()}).eq("id",run.id).eq("lease_token",run.lease_token);
  return Response.json({processed:1,queued:1});
});
