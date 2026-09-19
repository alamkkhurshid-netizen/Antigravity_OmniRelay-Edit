import Link from "next/link";

export function Brand({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <Link className={`product-brand ${compact ? "compact" : ""} ${className}`} href="/">
      {/* The supplied brand raster must be rendered directly in Sites/Vinext. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={compact ? "/favicon.jpeg" : "/omnirelay-logo.jpeg"}
        alt="OmniRelay"
      />
    </Link>
  );
}
