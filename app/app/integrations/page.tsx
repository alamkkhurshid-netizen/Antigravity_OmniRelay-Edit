import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { WhatsAppConnect } from "./whatsapp-connect";
import { TemplateReadiness } from "./template-readiness";

export default async function IntegrationsPage() {
  const {supabase,organization}=await getWorkspace();
  if(!organization)redirect("/onboarding");
  const [{data:connection},{data:templates},{data:reminders},{data:doctorDispatches},{count:queued},{count:sent},{count:failed}]=await Promise.all([
    supabase.from("channel_connections").select("status,provider,display_name,display_address,external_account_id,external_phone_number_id,capabilities,last_verified_at,last_error").eq("organization_id",organization.id).eq("channel","whatsapp").eq("provider","meta_cloud").maybeSingle(),
    supabase.from("channel_message_templates").select("id,event_type,provider_template_name,language_code,status,variable_map").eq("organization_id",organization.id).eq("channel","whatsapp").order("event_type"),
    supabase.from("reminder_events").select("event_type,status").eq("organization_id",organization.id).eq("channel","whatsapp").limit(500),
    supabase.from("doctor_queue_dispatches").select("status").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(100),
    supabase.from("reminder_events").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).eq("channel","whatsapp").eq("status","scheduled"),
    supabase.from("reminder_events").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).eq("channel","whatsapp").eq("status","sent"),
    supabase.from("reminder_events").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).eq("channel","whatsapp").eq("status","failed"),
  ]);
  const connected=connection?.status==="test"||connection?.status==="live";
  const approved=templates?.filter((item)=>item.status==="approved").length??0;
  const metaAppId=process.env.META_APP_ID??"973751725720667";
  const embeddedSignupConfigurationId=process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  return <section className="channel-page">
    <header className="channel-hero"><div><span className="app-eyebrow">WHATSAPP DELIVERY</span><h2>Turn every booking event into a reliable patient message.</h2><p>OmniRelay owns the appointment state, reminder schedule and retry history. Meta Cloud API delivers approved templates without exposing privileged credentials to the browser.</p></div><i className={connected?"live":""}>{connected?connection.status:"READY TO CONNECT"}</i></header>
    <div className="channel-metrics"><article><span>Connection</span><b>{connected?"Active":"Pending"}</b><small>{connection?.display_address||"Meta credentials required"}</small></article><article><span>Approved templates</span><b>{approved}/{templates?.length??0}</b><small>Meta-approved utility messages</small></article><article><span>Queued</span><b>{queued??0}</b><small>Waiting for delivery</small></article><article><span>Delivered to provider</span><b>{sent??0}</b><small>{failed??0} failed attempts</small></article></div>
    <WhatsAppConnect appId={metaAppId} configurationId={embeddedSignupConfigurationId} connected={connected} displayAddress={connection?.display_address} onboardingMode={(connection?.capabilities as {onboarding_mode?:string}|null)?.onboarding_mode}/>
    <section className="meta-onboarding-path"><header><div><span className="app-eyebrow">SMOOTH CLINIC ONBOARDING</span><h3>One guided Meta connection</h3></div><span>Recommended: Coexistence</span></header><div><article><i>1</i><b>Continue with Meta<small>Clinic owner signs in directly; OmniRelay never receives the Meta password.</small></b></article><article><i>2</i><b>Select the business<small>Choose the verified business portfolio and WhatsApp Business Account.</small></b></article><article><i>3</i><b>Keep the existing number<small>Where Meta marks it eligible, connect through Coexistence and retain the Business app.</small></b></article><article><i>4</i><b>Automatic verification<small>OmniRelay maps the tenant, subscribes webhooks and verifies the number before activation.</small></b></article></div><p><b>Existing WhatsApp Business app number:</b> choose Coexistence only when Meta offers it. If it is not offered, exit without changes and review eligibility; OmniRelay will never silently migrate or replace that number. <b>New spare SIM:</b> choose Meta&apos;s new-phone-number path instead—Coexistence is not required.</p></section>
    <TemplateReadiness templates={templates??[]} reminders={reminders??[]} doctorDispatches={doctorDispatches??[]}/>
    <section className="connection-foundation"><header><div><span className="app-eyebrow">CONNECTION FOUNDATION</span><h3>Meta Cloud API readiness</h3></div><span>{connected?"Verified":"Embedded Signup pending"}</span></header><div className="connection-checklist">
      <article className="complete"><i>✓</i><b>Secure server adapter<small>Access tokens and app secrets stay server-side.</small></b></article>
      <article className="complete"><i>✓</i><b>Webhook verification<small>Signature checking and delivery receipts are ready.</small></b></article>
      <article className="complete"><i>✓</i><b>Durable message queue<small>Booking, reminder, cancellation and follow-up events are tracked.</small></b></article>
      <article className={connected?"complete":""}><i>{connected?"✓":"4"}</i><b>Meta credentials<small>{connected?"Business account and phone number verified.":"CTO will configure the required production secrets."}</small></b></article>
    </div><div className="webhook-card"><div><span>CALLBACK URL</span><code>https://bywsjwpaezdlicsbujbk.supabase.co/functions/v1/whatsapp-webhook</code></div><small>Customer accounts are subscribed automatically during Embedded Signup; no 24×7 OmniRelay operator action is needed.</small></div></section>
    <section className="template-registry"><header><div><span className="app-eyebrow">MESSAGE GOVERNANCE</span><h3>Required WhatsApp templates</h3></div><span>Utility category</span></header><div>{templates?.map((item)=><article key={item.id}><div><b>{item.event_type.replaceAll("_"," ")}</b><small>{item.provider_template_name} · {item.language_code}</small></div><i className={`template-${item.status}`}>{item.status}</i></article>)}</div><p>Templates stay in draft until their exact wording is reviewed and submitted in WhatsApp Manager. OmniRelay will dispatch only templates marked approved.</p></section>
    <section className="channel-roadmap"><span className="app-eyebrow">ACTIVATION SEQUENCE</span><div><article><b>1</b><span>Meta app and WhatsApp Business Account</span></article><article><b>2</b><span>Test phone number and webhook verification</span></article><article><b>3</b><span>Template approval and test delivery</span></article><article><b>4</b><span>Production number and live monitoring</span></article></div></section>
  </section>;
}
