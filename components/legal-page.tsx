import Link from "next/link";
import { Brand } from "./brand";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export function LegalPage({
  eyebrow,
  title,
  summary,
  updated = "28 July 2026",
  sections,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updated?: string;
  sections: LegalSection[];
}) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Brand />
        <nav aria-label="Legal navigation">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/data-deletion">Data deletion</Link>
          <Link className="legal-home-link" href="/">Return to OmniRelay</Link>
        </nav>
      </header>
      <section className="legal-hero">
        <div className="legal-hero-copy">
          <span className="app-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{summary}</p>
          <small>Effective and last updated: {updated}</small>
        </div>
        <aside>
          <span>PRIVACY CONTACT</span>
          <a href="mailto:therasynergybiomedex@gmail.com">
            therasynergybiomedex@gmail.com
          </a>
          <p>For privacy questions, access requests or account deletion.</p>
        </aside>
      </section>
      <div className="legal-layout">
        <aside className="legal-index">
          <span>ON THIS PAGE</span>
          {sections.map((section, index) => (
            <a href={`#section-${index + 1}`} key={section.title}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              {section.title}
            </a>
          ))}
        </aside>
        <article className="legal-document">
          {sections.map((section, index) => (
            <section id={`section-${index + 1}`} key={section.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items && (
                  <ul>
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </article>
      </div>
      <footer className="legal-footer">
        <Brand />
        <p>OmniRelay · Connect. Automate. Grow.</p>
        <div>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/data-deletion">Data Deletion</Link>
        </div>
      </footer>
    </main>
  );
}
