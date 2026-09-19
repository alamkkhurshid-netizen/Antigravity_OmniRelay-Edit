import {redirect} from "next/navigation";
import {getWorkspace} from "@/lib/workspace";
import {ClinicOperationsWorkspace} from "./workspace";

export default async function ClinicOperationsPage(){
  const {organization}=await getWorkspace();
  if(!organization)redirect("/onboarding");
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"}).format(new Date());
  return <ClinicOperationsWorkspace today={today}/>;
}
