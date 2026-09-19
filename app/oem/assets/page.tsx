import { Box, CheckCircle2 } from "lucide-react";

export default function OemAssetsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Partner Assets</h1>
        <p className="mt-1 text-sm text-slate-400">Manage global white-labeling and PWA configurations.</p>
      </header>

      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-6 max-w-2xl">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-slate-800 p-3">
            <Box className="size-6 text-[#1bc5a8]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">PWA & Branding Manifests</h2>
            <p className="mt-1 text-sm text-slate-400">
              The PWA asset generator has successfully run. All tenant workspaces are currently 
              serving the global OmniRelay splash screens and icons to their users when installed 
              as a Progressive Web App.
            </p>
            
            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-[#1bc5a8]">
              <CheckCircle2 className="size-4" />
              Manifests successfully injected into global layout.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
