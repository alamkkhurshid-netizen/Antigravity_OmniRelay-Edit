import {NextResponse} from "next/server";
import {getWorkspace} from "@/lib/workspace";

const kinds=new Set(["booking_approval","waitlist","schedule_disruption","care_retry","appointment_retry","care_task"]);
const actions=new Set(["claim","review","release"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request:Request){
  const {supabase,organization}=await getWorkspace();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(!organization)return NextResponse.json({error:"Workspace not found."},{status:409});
  const body=await request.json().catch(()=>({})) as {kind?:string;subjectId?:string;action?:string};
  if(!body.kind||!kinds.has(body.kind)||!body.subjectId||!uuid.test(body.subjectId)||!body.action||!actions.has(body.action))return NextResponse.json({error:"Invalid action item."},{status:400});
  const status=body.action==="review"?"reviewed":body.action==="release"?"released":"claimed";
  const payload={organization_id:organization.id,item_kind:body.kind,subject_id:body.subjectId,assigned_to:body.action==="release"?null:user.id,status,assigned_at:new Date().toISOString(),reviewed_at:body.action==="review"?new Date().toISOString():null,updated_at:new Date().toISOString()};
  const {data,error}=await supabase.from("action_centre_assignments").upsert(payload,{onConflict:"organization_id,item_kind,subject_id"}).select("item_kind,subject_id,assigned_to,status,updated_at").single();
  if(error)return NextResponse.json({error:error.message},{status:403});
  return NextResponse.json({assignment:data});
}
