import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { CtoWorkspace } from "./workspace";

export default async function SuperCtoPage() {
  const { organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  
  return <CtoWorkspace />;
}
