import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About OmniRelay",
  description: "The people, principles and impact pledge behind OmniRelay.",
};

export default function AboutPage(){
 return <main className="about-page">
  <nav className="nav shell about-nav"><Link href="/" className="logo asset-logo"><img src="/new-logo.png" alt="OmniRelay"/></Link><div className="links"><Link href="/#platform">Platform</Link><Link href="/#impact">Impact</Link><Link href="/login">Sign in</Link></div><Link className="btn dark navbtn" href="/login">Start free trial ↗</Link></nav>
  <section className="about-hero shell"><span className="eyebrow">ABOUT OMNIRELAY</span><h1>Technology that helps<br/>business move—and <em>people thrive.</em></h1><p>OmniRelay is building an omnichannel operating system for conversations, appointments, automation and trustworthy AI. We begin with healthcare workflows, then extend the same reliable foundations to other service businesses.</p></section>
  <section className="about-principles shell"><article><b>01</b><h2>Human accountability</h2><p>AI assists people; it does not replace clinical judgment, informed consent or accountable business decisions.</p></article><article><b>02</b><h2>Trust by design</h2><p>Tenant isolation, least privilege, auditability and explicit consent are product requirements—not finishing touches.</p></article><article><b>03</b><h2>Useful automation</h2><p>We automate repetitive coordination while keeping handoff paths visible and controllable.</p></article></section>
  <section className="leadership shell section"><div><span className="eyebrow">LEADERSHIP</span><h2>Built with ambition.<br/><em>Governed with clarity.</em></h2></div><div className="leader-grid"><article><small>FOUNDER</small><h3>Khurshid Alam</h3><p>Founder and product owner of OmniRelay, shaping its mission to make intelligent business operations accessible to growing organisations.</p></article><article><small>AI CTO</small><h3>Aariv</h3><p>Aariv is OmniRelay’s AI CTO: an AI system supporting product architecture, engineering decisions and delivery. Aariv is not a human corporate officer, legal signatory or independent fiduciary.</p></article></div></section>
  <section className="about-impact shell section" id="impact"><div className="impact-mark"><span>2%</span><small>SOCIAL IMPACT PLEDGE</small></div><div><span className="eyebrow">AARIV IMPACT FUND</span><h2>Progress measured by<br/><em>people helped.</em></h2><p>OmniRelay pledges 2% of eligible revenue to the Aariv Impact Fund. The programme will use a separate ledger, documented eligibility rules and verified reporting before public contribution totals or beneficiary claims are displayed.</p><p className="legal-note">This is a voluntary company pledge and is not described as statutory CSR unless OmniRelay’s legal and accounting advisers confirm that status.</p></div></section>
  <footer><div className="shell copyright">© 2026 OmniRelay. All rights reserved.<span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/data-deletion">Data deletion</a></span></div></footer>
 </main>
}
