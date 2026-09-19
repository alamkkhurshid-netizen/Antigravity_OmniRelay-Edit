"use client";
import Script from "next/script";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

declare global { interface Window { Razorpay?: new(options:Record<string,unknown>)=>{open:()=>void} } }

export default function OpaqueDepositCheckout(){
  const params=useParams<{token:string}>(),token=String(params?.token??"");
  const [ready,setReady]=useState(false),[message,setMessage]=useState("Preparing secure ₹1 test checkout…");
  useEffect(()=>{if(!token)return;let active=true;(async()=>{
    const response=await fetch(`/api/readiness/deposit-checkout?token=${encodeURIComponent(token)}`,{cache:"no-store"}),order=await response.json();
    if(!active)return;
    if(!response.ok){setMessage(order.error??"Checkout unavailable.");return}
    const wait=()=>{if(!active)return;if(!window.Razorpay){setTimeout(wait,100);return}setReady(true);setMessage("Razorpay test mode · no real money will be charged");new window.Razorpay({key:order.key_id,order_id:order.order_id,amount:order.amount,currency:order.currency,name:"OmniRelay",description:"₹1 controlled deposit acceptance",handler:async(result:Record<string,string>)=>{const verified=await fetch("/api/readiness/deposit-checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...result,fixture_id:order.fixture_id,token})});setMessage(verified.ok?"Test payment verified successfully.":"Payment verification failed.")},modal:{ondismiss:()=>setMessage("Test checkout closed without payment.")}}).open()};wait();
  })();return()=>{active=false}},[token]);
  return <main className="legal-page"><Script src="https://checkout.razorpay.com/v1/checkout.js"/><section><span>CONTROLLED ACCEPTANCE</span><h1>₹1 deposit test</h1><p>{message}</p><small>{ready?"Complete using Razorpay test credentials only.":"This opaque link expires automatically and contains no patient information."}</small></section></main>
}
