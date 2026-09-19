import {NextResponse} from "next/server";
import {getWorkspace} from "@/lib/workspace";

export async function POST(request:Request){
  const {supabase,organization}=await getWorkspace();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(!organization)return NextResponse.json({error:"Workspace not found."},{status:409});
  const body=await request.json().catch(()=>({})) as {rows?:unknown[];commit?:boolean;sourceFormat?:string};
  if(!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>200)return NextResponse.json({error:"Upload between 1 and 200 doctor rows."},{status:400});
  const {data:allowed,error:limitError}=await supabase.rpc("consume_api_rate_limit",{p_bucket:"doctor_bulk_import",p_limit:20,p_window_seconds:3600});
  if(limitError)return NextResponse.json({error:"Import safety check is temporarily unavailable."},{status:503});
  if(!allowed)return NextResponse.json({error:"Import limit reached. Try again later."},{status:429});
  const {data,error}=await supabase.rpc("import_doctor_roster_v2",{
    p_organization_id:organization.id,p_rows:body.rows,p_commit:Boolean(body.commit),p_source_format:body.sourceFormat==="json"?"json":"csv"
  });
  if(error)return NextResponse.json({error:error.code==="42501"?"Administrator access required.":"The import could not be validated safely."},{status:error.code==="42501"?403:409});
  return NextResponse.json(data);
}
