import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
export async function POST(request:Request){
  try{const input=await request.json() as {challenge_id?:string;code?:string};const admin=createAdminClient();const {data,error}=await admin.rpc("verify_booking_phone_otp",{p_challenge_id:String(input.challenge_id??""),p_code:String(input.code??"")});if(error)throw new Error(error.message);const result=data as {ok:boolean;error?:string;verification_token?:string;expires_in?:number};return NextResponse.json(result,{status:result.ok?200:400,headers:{"Cache-Control":"no-store"}})}catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Unable to verify code"},{status:400,headers:{"Cache-Control":"no-store"}})}
}
