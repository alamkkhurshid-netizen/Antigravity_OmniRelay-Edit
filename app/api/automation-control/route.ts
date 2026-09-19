import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export async function PATCH(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const target=typeof payload.target==="string"?payload.target:"",id=typeof payload.id==="string"?payload.id:"",action=typeof payload.action==="string"?payload.action:"";
  if (!id) return NextResponse.json({ error: "Automation record is required." }, { status: 400 });
  if(target==="workflow"&&["pause","resume"].includes(action)){
    const status=action==="pause"?"paused":"active";
    const {data,error}=await supabase.from("automation_workflows").update({status,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",organization.id).select("id,name,trigger_key,status,max_attempts,timeout_seconds,last_run_at,last_success_at,last_failure_at,configuration").single();
    if(error||!data)return NextResponse.json({error:error?.message??"Workflow could not be updated."},{status:400});
    return NextResponse.json({workflow:data});
  }
  if(target==="run"&&["retry","cancel"].includes(action)){
    const {data,error}=await supabase.rpc("control_automation_run",{p_organization_id:organization.id,p_run_id:id,p_action:action});
    if(error||!data)return NextResponse.json({error:error?.message??"Run could not be updated."},{status:400});
    return NextResponse.json({run:data});
  }
  return NextResponse.json({error:"Unsupported automation action."},{status:400});
}
