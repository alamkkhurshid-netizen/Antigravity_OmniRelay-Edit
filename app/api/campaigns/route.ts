import {NextResponse} from "next/server";
import {getWorkspace} from "@/lib/workspace";
const eventByType:Record<string,string>={care:"care_campaign",marketing:"marketing_campaign",emergency:"emergency_notice"};
const normalizeAddress=(value:string)=>value.replace(/\D/g,"");
export async function POST(request:Request){
 const {supabase,organization}=await getWorkspace(),{data:{user}}=await supabase.auth.getUser();
 if(!user||!organization)return NextResponse.json({error:"Authentication required."},{status:401});
 const b=await request.json(),type=String(b.campaignType??"");
 const name=String(b.name??"").trim(),messageNote=String(b.messageNote??"").trim();
 if(!eventByType[type])return NextResponse.json({error:"Invalid campaign type."},{status:400});
 if(name.length<2||name.length>120)return NextResponse.json({error:"Enter a campaign name between 2 and 120 characters."},{status:400});
 if(messageNote.length<3||messageNote.length>1000)return NextResponse.json({error:"Enter a patient-safe message between 3 and 1,000 characters."},{status:400});
 const emergencyAction=String(b.action??"");
 if(type==="emergency"&&(!b.locationId||!b.resourceId||!b.appointmentDate||!["reschedule_required","notify_only"].includes(emergencyAction)))return NextResponse.json({error:"Choose the affected doctor, chamber, date and appointment action."},{status:400});
 const {data:template}=await supabase.from("channel_message_templates").select("id").eq("id",b.templateId).eq("organization_id",organization.id).eq("event_type",eventByType[type]).eq("status","approved").maybeSingle();
 if(!template)return NextResponse.json({error:"The matching Meta template must be approved first."},{status:400});
  const [{data:patients},{data:outs},{data:appointments}]=await Promise.all([
   supabase.from("patient_profiles").select("id,phone,health_concern,care_communications_consent,marketing_consent").eq("organization_id",organization.id),
   supabase.from("communication_opt_outs").select("address,scope").eq("organization_id",organization.id).eq("channel","whatsapp"),
   type==="emergency"?supabase.from("appointments").select("id,patient_id,status,starts_at").eq("organization_id",organization.id).eq("location_id",b.locationId).eq("resource_id",b.resourceId).gte("starts_at",`${b.appointmentDate}T00:00:00+05:30`).lt("starts_at",`${b.appointmentDate}T23:59:59+05:30`).in("status",["pending","payment_pending","confirmed","arrived","rescheduling_required"]):Promise.resolve({data:[] as {id:string;patient_id:string|null;status:string;starts_at:string}[]})
  ]);

  let eligible: Array<{ id: string; phone: string | null }> = [];
  const affectedRows=appointments??[],affected=new Set(affectedRows.map(a=>a.patient_id).filter(Boolean));

  if (b.segment === "csv") {
    const rawCsvContacts: Array<{ name: string; phone: string; notes?: string }> = Array.isArray(b.csvContacts) ? b.csvContacts : [];
    if (!rawCsvContacts.length) {
      return NextResponse.json({ error: "Upload or provide at least one valid contact in the CSV list." }, { status: 400 });
    }

    const currentPatients = patients ?? [];
    const patientByPhone = new Map(currentPatients.filter(p => p.phone).map(p => [normalizeAddress(p.phone!), p]));
    const toInsert: Array<{ organization_id: string; full_name: string; phone: string; health_concern: string | null; care_communications_consent: boolean; marketing_consent: boolean; source: string }> = [];

    for (const contact of rawCsvContacts) {
      const cleanPhone = contact.phone ? normalizeAddress(contact.phone) : "";
      if (!cleanPhone || cleanPhone.length < 10) continue;
      if (!patientByPhone.has(cleanPhone)) {
        toInsert.push({
          organization_id: organization.id,
          full_name: (contact.name || "Patient").trim(),
          phone: contact.phone.startsWith("+") ? contact.phone : `+${contact.phone}`,
          health_concern: contact.notes || null,
          care_communications_consent: true,
          marketing_consent: true,
          source: "csv_broadcast",
        });
      }
    }

    if (toInsert.length) {
      const { data: inserted, error: insertError } = await supabase.from("patient_profiles").insert(toInsert).select("id,phone,health_concern,care_communications_consent,marketing_consent");
      if (!insertError && inserted) {
        inserted.forEach(p => { if (p.phone) patientByPhone.set(normalizeAddress(p.phone), p as any); });
      }
    }

    const scope = type === "marketing" ? "marketing" : "care";
    const optedOutSet = new Set((outs ?? []).filter(o => o.scope === "all" || o.scope === scope).map(o => normalizeAddress(o.address)));

    for (const contact of rawCsvContacts) {
      const cleanPhone = contact.phone ? normalizeAddress(contact.phone) : "";
      if (optedOutSet.has(cleanPhone)) continue;
      const patient = patientByPhone.get(cleanPhone);
      if (patient) {
        eligible.push({ id: patient.id, phone: patient.phone });
      }
    }
  } else {
    eligible=(patients??[]).filter(p=>{if(!p.phone)return false;const scope=type==="marketing"?"marketing":"care";if(type==="marketing"?!p.marketing_consent:!p.care_communications_consent)return false;if((outs??[]).some(o=>normalizeAddress(o.address)===normalizeAddress(p.phone!)&&(o.scope==="all"||o.scope===scope)))return false;if(type==="emergency"&&!affected.has(p.id))return false;if(b.segment==="health"&&!String(p.health_concern??"").toLowerCase().includes(String(b.keyword??"").toLowerCase()))return false;return true});
  }

 if(type==="emergency"&&!affectedRows.length)return NextResponse.json({error:"No active appointments match that doctor, chamber and date."},{status:400});
 if(!eligible.length)return NextResponse.json({error:"No patients remain after consent and audience safeguards."},{status:400});
 const scheduled=b.scheduledFor?new Date(b.scheduledFor).toISOString():new Date().toISOString();
 const {data:c,error}=await supabase.from("campaigns").insert({organization_id:organization.id,name,campaign_type:type,template_id:template.id,status:"scheduled",scheduled_for:scheduled,message_note:messageNote,audience_filter:{segment:b.segment,keyword:b.keyword,location_id:b.locationId,resource_id:b.resourceId,appointment_date:b.appointmentDate,action:emergencyAction},created_by:user.id}).select("id").single();
 if(error||!c)return NextResponse.json({error:error?.message??"Creation failed."},{status:400});
 const {error:re}=await supabase.from("campaign_recipients").insert(eligible.map(p=>({campaign_id:c.id,organization_id:organization.id,patient_id:p.id,recipient_address:p.phone,consent_basis:type,scheduled_for:scheduled,status:"approved"})));
 if(re)return NextResponse.json({error:re.message},{status:400});
 if(type==="emergency"){
  const futureIds=affectedRows.filter(a=>a.status!=="arrived"&&new Date(a.starts_at).getTime()>Date.now()).map(a=>a.id);
  if(emergencyAction==="reschedule_required"&&futureIds.length)await supabase.from("appointments").update({status:"rescheduling_required",updated_at:new Date().toISOString()}).in("id",futureIds).eq("organization_id",organization.id);
  const optedOut=(outs??[]);
  const exceptionTasks=affectedRows.flatMap(a=>{
    if(!a.patient_id)return [];
    const patient=(patients??[]).find(p=>p.id===a.patient_id),phone=patient?.phone??"",blocked=!phone?"No WhatsApp number is recorded.":!patient?.care_communications_consent?"Care communication consent is not active.":optedOut.some(o=>normalizeAddress(o.address)===normalizeAddress(phone)&&(o.scope==="all"||o.scope==="care"))?"Patient opted out of WhatsApp care messages.":a.status==="arrived"?"Patient is already marked arrived; coordinate in clinic.":"";
    return blocked?[{organization_id:organization.id,patient_id:a.patient_id,appointment_id:a.id,task_type:"care",title:"Emergency contact required",details:`Doctor-specific emergency notice: ${blocked}`,due_at:new Date().toISOString(),priority:"urgent",status:"open",created_by:user.id}]:[];
  });
  if(exceptionTasks.length)await supabase.from("patient_care_tasks").insert(exceptionTasks);
 }
 await supabase.from("campaign_events").insert({organization_id:organization.id,campaign_id:c.id,event_type:"created",actor_user_id:user.id,payload:{eligible:eligible.length,resource_id:b.resourceId??null,location_id:b.locationId??null,appointment_date:b.appointmentDate??null,action:emergencyAction||null}});
 return NextResponse.json({id:c.id,eligible:eligible.length});
}

export async function PATCH(request:Request){
 const {supabase,organization}=await getWorkspace(),{data:{user}}=await supabase.auth.getUser();
 if(!user||!organization)return NextResponse.json({error:"Authentication required."},{status:401});
 const b=await request.json(),action=String(b.action??""),id=String(b.id??"");
 const {data:campaign}=await supabase.from("campaigns").select("id,status").eq("id",id).eq("organization_id",organization.id).maybeSingle();
 if(!campaign)return NextResponse.json({error:"Campaign not found."},{status:404});
 const updates:Record<string,unknown>={updated_at:new Date().toISOString()};
 if(action==="pause"&&["scheduled","running"].includes(campaign.status))updates.status="paused";
 else if(action==="resume"&&campaign.status==="paused")updates.status="scheduled";
 else if(action==="send_now"&&["scheduled","paused"].includes(campaign.status)){updates.status="scheduled";updates.scheduled_for=new Date().toISOString();await supabase.from("campaign_recipients").update({scheduled_for:updates.scheduled_for}).eq("campaign_id",id).eq("status","approved")}
 else if(action==="cancel"&&!["completed","cancelled"].includes(campaign.status)){updates.status="cancelled";await supabase.from("campaign_recipients").update({status:"skipped",failure_reason:"Campaign cancelled."}).eq("campaign_id",id).in("status",["pending","approved"])}
 else return NextResponse.json({error:"That action is not valid for the current campaign state."},{status:409});
 const {error}=await supabase.from("campaigns").update(updates).eq("id",id).eq("organization_id",organization.id);
 if(error)return NextResponse.json({error:error.message},{status:400});
 await supabase.from("campaign_events").insert({organization_id:organization.id,campaign_id:id,event_type:action,actor_user_id:user.id,payload:{previous_status:campaign.status}});
 return NextResponse.json({ok:true});
}
