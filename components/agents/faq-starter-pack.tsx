"use client";

interface FaqStarterPackProps {
  approvedFaqs: number;
  totalFaqs: number;
  starterRemaining: number;
  busy: boolean;
  installStarterPack: () => void;
}

export function FaqStarterPack({
  approvedFaqs, totalFaqs, starterRemaining, busy, installStarterPack
}: FaqStarterPackProps) {
  const readyPercent = totalFaqs ? Math.round(approvedFaqs / totalFaqs * 100) : 0;
  
  return (
    <section className="faq-starter">
      <div className="faq-starter-copy">
        <span className="app-eyebrow">CLINIC FAQ STARTER PACK</span>
        <h3>Approve the answers patients may receive.</h3>
        <p>Install twenty standard clinic questions as drafts. Edit the wording for your clinic, then approve only the answers your team has verified.</p>
        <div className="faq-readiness">
          <div><b>{approvedFaqs}</b><span>approved FAQs</span></div>
          <div><b>{totalFaqs}</b><span>total FAQs</span></div>
          <div><b>{starterRemaining}</b><span>starter drafts missing</span></div>
        </div>
      </div>
      <div className="faq-starter-action">
        <div className="faq-progress">
          <span style={{width:`${readyPercent}%`}}/>
          <i>{readyPercent}% ready</i>
        </div>
        <button className="primary-button" type="button" disabled={busy||starterRemaining===0} onClick={()=>void installStarterPack()}>
          {starterRemaining===0?"Starter pack installed":busy?"Adding draft FAQs…":`Add ${starterRemaining} draft FAQs`}
        </button>
        <small>Draft answers are never used in patient conversations.</small>
      </div>
    </section>
  );
}
