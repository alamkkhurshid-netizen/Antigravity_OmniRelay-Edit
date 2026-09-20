"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bot, LineChart, Menu, MessagesSquare, Settings2, X, House, LogOut, ChevronDown } from "lucide-react";
import { Brand } from "./brand";
import { createClient } from "@/lib/supabase/client";

type NavItem = [label: string, href: string, icon: React.ComponentType<{ size?: number; className?: string }>];

const navGroups: { label: string; items: NavItem[] }[] = [
  { label: "Workspace", items: [["Overview", "/app", House], ["Conversations", "/app/conversations", MessagesSquare], ["AI Agents", "/app/agents", Bot], ["Analytics", "/app/analytics", LineChart]] },
  { label: "Administration", items: [["Business Setup", "/app/settings", Settings2]] },
];

export function AppShell({ children, email }: { children: React.ReactNode; email: string }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-[#087fb9]/20 selection:text-[#087fb9]">
      
      {/* Mobile Navigation Overlay */}
      {mobileNavOpen && (
        <button type="button" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
      )}
      
      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-64 flex-col border-r border-slate-200 bg-white shadow-sm transition-transform duration-300 lg:sticky lg:top-0 lg:z-40 lg:h-screen lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`} aria-label="Workspace navigation">
        
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-100">
          <Brand className="h-8 w-auto" />
          <button type="button" className="lg:hidden text-slate-500 hover:text-slate-900" onClick={() => setMobileNavOpen(false)}>
            <X className="size-5" />
          </button>
        </div>

        {/* Workspace Selector */}
        <div className="p-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-sm cursor-pointer hover:border-[#087fb9]/30 transition-colors">
            <div className="flex items-center justify-center size-8 rounded-lg bg-gradient-to-br from-[#087fb9] to-[#18bfc5] text-white font-bold text-sm">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-slate-900 truncate">My Workspace</span>
              <span className="block text-xs text-slate-500">Free Trial</span>
            </div>
            <ChevronDown className="size-4 text-slate-400" />
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
          {navGroups.map((group) => (
            <div key={group.label}>
              <h3 className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{group.label}</h3>
              <div className="space-y-1">
                {group.items.map(([label, href, Icon]) => {
                  const active = pathname === href;
                  return (
                    <Link
                      key={label}
                      href={href}
                      onClick={() => setMobileNavOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        active 
                          ? "bg-[#087fb9]/10 text-[#087fb9]" 
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <Icon className={`size-4 ${active ? "text-[#087fb9]" : "text-slate-400"}`} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-slate-100">
          <div className="relative">
            <button 
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
              onClick={() => setAccountOpen(!accountOpen)}
            >
              <div className="size-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs border border-slate-300">
                {email.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-slate-900 truncate">{email}</span>
              </div>
            </button>

            {accountOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50">
                <button 
                  disabled={signingOut}
                  onClick={signOut}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                >
                  <LogOut className="size-4" />
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <button type="button" className="p-2 -ml-2 text-slate-500 rounded-lg hover:bg-slate-50" onClick={() => setMobileNavOpen(true)}>
              <Menu className="size-5" />
            </button>
            <Brand className="h-6 w-auto" />
          </div>
          <div className="size-8 rounded-full bg-gradient-to-br from-[#087fb9] to-[#18bfc5] text-white flex items-center justify-center text-xs font-bold">
            {email.charAt(0).toUpperCase()}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          {children}
        </div>
      </main>

    </div>
  );
}
