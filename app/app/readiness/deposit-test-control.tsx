"use client";
import { useState } from "react";

export function DepositTestControl({status}:{status:string}){
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  async function prepare(){setBusy(true);setNotice("");const response=await fetch("/api/readiness/deposit-test",{method:"POST"});const result=await response.json().catch(()=>({})) as {run?:{recipient_last4:string};error?:string};if(!response.ok||!result.run)setNotice(result.error??"The controlled test could not be prepared.");else{setNotice(`Prepared for delivery-verified ••••${result.run.recipient_last4}. No message has been sent yet.`);setTimeout(()=>location.reload(),900)}setBusy(false)}
  const locked=["armed","running","passed"].includes(status);
  return <section className="readiness-test-control"><div><span className="app-eyebrow">DEPOSIT ACCEPTANCE</span><h3>₹1 controlled test</h3><p>Preparation binds the verified recipient, one-message ceiling and 30-minute expiry. Dispatch remains service-controlled.</p></div><button type="button" disabled={busy||locked} onClick={()=>void prepare()}>{busy?"Preparing…":locked?`Status: ${status}`:"Prepare controlled test"}</button>{notice&&<small role="status">{notice}</small>}</section>;
}
