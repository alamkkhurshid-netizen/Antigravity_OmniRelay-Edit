import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request:Request){
  try{const input=await request.json() as Record<string,unknown>;const {data,error}=await createAdminClient().rpc("consume_booking_phone_verification",{p_challenge_id:String(input.challenge_id??""),p_verification_token:String(input.verification_token??""),p_booking_reference:String(input.booking_reference??""),p_manage_token:String(input.manage_token??"")});if(error||data!==true)throw new Error(error?.message||"Phone verification could not be attached to this booking");return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}})}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Unable to attach verification"},{status:400,headers:{"Cache-Control":"no-store"}})}
}
