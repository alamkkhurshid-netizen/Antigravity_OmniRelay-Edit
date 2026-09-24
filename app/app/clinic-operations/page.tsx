import {redirect} from "next/navigation";
import {getWorkspace} from "@/lib/workspace";
import {ClinicOperationsWorkspace} from "./workspace";

export default async function ClinicOperationsPage(){
  const {organization}=await getWorkspace();
  if(!organization)redirect("/onboarding");
  const businessCategory = (organization.extra as Record<string, unknown>)?.business_category;
  if (businessCategory === "Retail & e-commerce") {
    redirect("/app/retail");
  }
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata"}).format(new Date());
  return <ClinicOperationsWorkspace today={today}/>;
}

