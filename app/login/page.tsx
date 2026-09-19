import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-[radial-gradient(circle_at_12%_8%,#dcf7f3,transparent_28%),#f5f7fb] lg:grid-cols-[1.1fr_.9fr]">
      <section className="flex min-h-[45vh] flex-col justify-between p-8 sm:p-12 lg:p-16">
        <Brand className="h-12 w-44" />
        <div className="my-16 max-w-2xl">
          <span className="text-xs font-black tracking-[.18em] text-primary">CLINIC OPERATIONS</span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">One calm workspace for every patient journey.</h1>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            Manage conversations, appointments, agents and automations without
            stitching together five different tools.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          <li className="rounded-2xl border border-border bg-white/70 p-4"><b className="block text-sm">Secure workspace</b><span className="mt-1 block text-xs text-muted-foreground">Your clinic controls access</span></li>
          <li className="rounded-2xl border border-border bg-white/70 p-4"><b className="block text-sm">Patient lifecycle</b><span className="mt-1 block text-xs text-muted-foreground">Bookings, care and follow-up</span></li>
          <li className="rounded-2xl border border-border bg-white/70 p-4"><b className="block text-sm">WhatsApp-first</b><span className="mt-1 block text-xs text-muted-foreground">Controlled patient messaging</span></li>
        </ul>
      </section>
      <section className="grid place-items-center bg-white p-6 sm:p-12">
        <LoginForm />
      </section>
    </main>
  );
}
