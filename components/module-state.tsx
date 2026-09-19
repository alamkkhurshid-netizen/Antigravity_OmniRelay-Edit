import Link from "next/link";

export function ModuleState({
  eyebrow,
  title,
  description,
  action,
  href,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: string;
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="module-page">
      <div className="module-hero">
        <span className="app-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        {action && href && <Link className="primary-link" href={href}>{action} →</Link>}
      </div>
      {children}
    </section>
  );
}
