"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const TOUR_KEY = "omnirelay-product-tour-v1";
const steps = [
  { target: "[data-tour='overview']", title: "Your workspace overview", body: "Start here each day to see the most important activity and the next setup step.", route: "/app" },
  { target: "[data-tour='action-centre']", title: "Action Centre", body: "This is where urgent work appears. Resolve these items first so bookings and reminders stay on track.", route: "/app" },
  { target: "[data-tour='conversations']", title: "Conversations", body: "Manage WhatsApp conversations here. Your team can reply, hand off and keep customer communication organised.", route: "/app/conversations" },
  { target: "[data-tour='appointments']", title: "Appointments", body: "Review, approve, reschedule and manage bookings from one place.", route: "/app/appointments" },
  { target: "[data-tour='guide']", title: "Help is always available", body: "Open OmniRelay Guide whenever you need to understand a feature or decide what to do next.", route: "/app" },
];

export function ProductTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const launch = () => { setStep(0); setOpen(true); };
    window.addEventListener("omnirelay:start-tour", launch);
    if (pathname === "/app" && !window.localStorage.getItem(TOUR_KEY)) {
      const timer = window.setTimeout(launch, 700);
      return () => { window.clearTimeout(timer); window.removeEventListener("omnirelay:start-tour", launch); };
    }
    return () => window.removeEventListener("omnirelay:start-tour", launch);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const element = document.querySelector(steps[step].target);
    element?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    element?.classList.add("tour-highlight");
    return () => element?.classList.remove("tour-highlight");
  }, [open, step, pathname]);
  function finish() { window.localStorage.setItem(TOUR_KEY, "completed"); setOpen(false); }
  function next() {
    if (step === steps.length - 1) return finish();
    const nextStep = step + 1; setStep(nextStep);
    if (pathname !== steps[nextStep].route) router.push(steps[nextStep].route);
  }
  if (!open) return null;
  const current = steps[step];
  return <div className="product-tour" role="dialog" aria-modal="true" aria-labelledby="tour-title"><div className="tour-backdrop" onClick={finish}/><section className="tour-card"><div className="tour-progress"><span>{step + 1} of {steps.length}</span><button type="button" onClick={finish}>Skip tour</button></div><span className="app-eyebrow">GETTING STARTED</span><h2 id="tour-title">{current.title}</h2><p>{current.body}</p><footer>{step > 0 ? <button type="button" className="tour-back" onClick={() => setStep(step - 1)}>Back</button> : <span/>}<button type="button" className="tour-next" onClick={next}>{step === steps.length - 1 ? "Finish tour" : "Next"}</button></footer></section></div>;
}
