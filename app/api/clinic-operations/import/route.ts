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
  const rows = body.rows as Array<Record<string, unknown>>;
  const chambers = Array.from(new Set(rows.map(r => String(r.chamber || "").trim()).filter(Boolean)));
  
  if (chambers.length > 0) {
    const { data: existingLocations } = await supabase
      .from("business_locations")
      .select("name")
      .eq("organization_id", organization.id);
      
    const existingNames = new Set((existingLocations || []).map(l => l.name.trim().toLowerCase()));
    const missingChambers = chambers.filter(c => !existingNames.has(c.toLowerCase()));
    
    if (missingChambers.length > 0) {
      const toInsert = missingChambers.map(name => ({
        organization_id: organization.id,
        name,
        location_type: "chamber",
        timezone: "Asia/Kolkata",
        active: true,
        address: {}
      }));
      await supabase.from("business_locations").insert(toInsert);
    }
  }

  const { count: serviceCount } = await supabase
    .from("organization_services")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.id);

  if ((serviceCount ?? 0) === 0) {
    await supabase.from("organization_services").insert({
      organization_id: organization.id,
      name: "Doctor Consultation",
      duration_minutes: 20,
      buffer_minutes: 0,
      price_paise: 50000,
      booking_enabled: true,
      active: true
    });
  }

  const {data,error}=await supabase.rpc("import_doctor_roster_v2",{
    p_organization_id:organization.id,p_rows:body.rows,p_commit:Boolean(body.commit),p_source_format:body.sourceFormat==="json"?"json":"csv"
  });
  if(error)return NextResponse.json({error:error.code==="42501"?"Administrator access required.":"The import could not be validated safely."},{status:error.code==="42501"?403:409});
  return NextResponse.json(data);
}

