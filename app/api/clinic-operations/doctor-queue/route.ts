import {NextResponse} from "next/server";
import {getWorkspace} from "@/lib/workspace";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request:Request){
  const {supabase,organization}=await getWorkspace();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(!organization)return NextResponse.json({error:"Workspace not found."},{status:409});
  const body=await request.json().catch(()=>({})) as {resourceId?:string;enabled?:boolean;acknowledged?:boolean};
  if(!body.resourceId||!uuid.test(body.resourceId)||typeof body.enabled!=="boolean")return NextResponse.json({error:"Valid doctor and setting are required."},{status:400});
  if(body.enabled&&body.acknowledged!==true)return NextResponse.json({error:"Confirm the doctor’s WhatsApp consent before enabling."},{status:400});
  const {data:allowed,error:limitError}=await supabase.rpc("consume_api_rate_limit",{p_bucket:"doctor_queue_setting",p_limit:30,p_window_seconds:3600});
  if(limitError)return NextResponse.json({error:"Notification safety check is temporarily unavailable."},{status:503});
  if(!allowed)return NextResponse.json({error:"Setting limit reached. Try again later."},{status:429});
  const {data,error}=await supabase.rpc("set_doctor_queue_consent",{p_organization_id:organization.id,p_resource_id:body.resourceId,p_enabled:body.enabled});
  if(error)return NextResponse.json({error:error.code==="42501"?"Only a clinic administrator can change doctor notifications.":error.message},{status:error.code==="42501"?403:409});
  return NextResponse.json({consent:data});
}

export async function POST(request:Request){
  const {supabase,organization}=await getWorkspace();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(!organization)return NextResponse.json({error:"Workspace not found."},{status:409});
  const body=await request.json().catch(()=>({})) as {ruleId?:string;shiftDate?:string};
  if(!body.ruleId||!uuid.test(body.ruleId)||!/^\d{4}-\d{2}-\d{2}$/.test(body.shiftDate??""))return NextResponse.json({error:"Valid shift is required."},{status:400});
  const {data:allowed,error:limitError}=await supabase.rpc("consume_api_rate_limit",{p_bucket:"doctor_queue_manual",p_limit:20,p_window_seconds:3600});
  if(limitError)return NextResponse.json({error:"Notification safety check is temporarily unavailable."},{status:503});
  if(!allowed)return NextResponse.json({error:"Manual queue limit reached. Try again later."},{status:429});
  const {data,error}=await supabase.rpc("schedule_doctor_queue_notification",{p_organization_id:organization.id,p_availability_rule_id:body.ruleId,p_shift_date:body.shiftDate});
  if(error){
    const accessDenied=error.code==="42501"&&/administrator access required/i.test(error.message);
    return NextResponse.json({error:accessDenied?"Administrator access required.":"Queue notification could not be scheduled safely."},{status:accessDenied?403:409});
  }
  return NextResponse.json({dispatch:data});
}
