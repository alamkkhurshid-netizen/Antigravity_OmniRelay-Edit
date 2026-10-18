import {
  Navigation,
  HeroSection,
  VerticalsSection,
  DeliverablesSection,
  AgenticWorkflowSection,
  ComparisonSection,
  ExecutiveAgentsSection,
  SecuritySection,
  CtaSection,
  FooterSection,
} from "@/components/landing";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-900 font-sans selection:bg-[#087fb9]/20 selection:text-[#087fb9]">
      <Navigation />
      <HeroSection />
      <VerticalsSection />
      <DeliverablesSection />
      <AgenticWorkflowSection />
      <ComparisonSection />
      <ExecutiveAgentsSection />
      <SecuritySection />
      <CtaSection />
      <FooterSection />
    </main>
  );
}
