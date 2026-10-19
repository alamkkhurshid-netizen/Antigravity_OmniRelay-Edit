import Link from "next/link";

export const Mark = () => (
  <div className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#087fb9]/10 to-[#18bfc5]/10 border border-[#087fb9]/20 shadow-sm">
    <div className="absolute w-3 h-3 rounded-full border-2 border-[#18bfc5] top-1.5 left-1 opacity-80 mix-blend-multiply" />
    <div className="absolute w-3 h-3 rounded-full border-2 border-[#087fb9] bottom-1.5 right-1 opacity-80 mix-blend-multiply" />
  </div>
);

export const Logo = () => (
  <Link href="/" className="flex items-center gap-2 group">
    <div className="relative w-[140px] h-[40px] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/new-logo.png" alt="OmniRelay" className="object-contain w-full h-full mix-blend-multiply" />
    </div>
  </Link>
);
