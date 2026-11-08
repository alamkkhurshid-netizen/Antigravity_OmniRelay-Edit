"use client";

import { ChevronDown, FileText, Info, MapPin, Phone } from "lucide-react";
import { Accordion, Tabs } from "radix-ui";
import { Agent, Contact, ContactAddress, Conversation } from "@/app/app/conversations/types";
import { object } from "@/app/app/conversations/utils";

interface ContactSidebarProps {
  active: Conversation | null;
  activeName: string;
  linked: { address: ContactAddress; contact: Contact | null } | null;
  assigned: Agent | null;
  setError: (val: string) => void;
  setContactEditorOpen: (val: boolean) => void;
}

export function ContactSidebar({
  active, activeName, linked, assigned, setError, setContactEditorOpen
}: ContactSidebarProps) {
  return (
    <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-panel lg:block">
      {active ? (
        <div className="p-3">
          <div className="border-b border-border pb-3 text-center">
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{activeName.slice(0, 1).toUpperCase()}</span>
            <h2 className="mt-1.5 text-xs font-semibold text-foreground truncate">{activeName}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{active.ai_paused ? "Human takeover active" : "AI assist ready"}</p>
          </div>
          <Tabs.Root defaultValue="info" className="mt-2.5">
            <Tabs.List className="grid grid-cols-3 rounded-lg bg-muted p-0.5" aria-label="Patient context">
              <Tabs.Trigger value="info" className="rounded-md px-1.5 py-1 text-xs font-semibold text-muted-foreground data-[state=active]:bg-panel data-[state=active]:text-foreground data-[state=active]:shadow-xs">Info</Tabs.Trigger>
              <Tabs.Trigger value="files" className="rounded-md px-1.5 py-1 text-xs font-semibold text-muted-foreground data-[state=active]:bg-panel data-[state=active]:text-foreground data-[state=active]:shadow-xs">Files</Tabs.Trigger>
              <Tabs.Trigger value="care" className="rounded-md px-1.5 py-1 text-xs font-semibold text-muted-foreground data-[state=active]:bg-panel data-[state=active]:text-foreground data-[state=active]:shadow-xs">Care</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="info" className="mt-2.5">
              <Accordion.Root type="multiple" defaultValue={["general", "appointments"]} className="divide-y divide-border rounded-lg border border-border">
                <Accordion.Item value="general">
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs font-semibold">General info <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition data-[state=open]:rotate-180" /></Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-2.5 pb-2.5 text-xs text-muted-foreground">
                    <div className="grid grid-cols-[1rem_1fr] gap-x-2 gap-y-1.5 items-center">
                      <Phone className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{active.contact_address ?? "No phone"}</span>
                      <MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{String(object(linked?.contact?.extra).locality ?? "Location not added")}</span>
                      <Info className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{assigned?.name ?? "Unassigned"} · {active.status}</span>
                    </div>
                  </Accordion.Content>
                </Accordion.Item>
                <Accordion.Item value="appointments">
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs font-semibold">Appointments <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition data-[state=open]:rotate-180" /></Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-2.5 pb-2 text-xs text-muted-foreground">
                    <p className="text-[11px]">View booking context and history.</p>
                    <a className="mt-1 inline-block text-[11px] font-semibold text-primary" href="/app/appointments">Open visits →</a>
                  </Accordion.Content>
                </Accordion.Item>
                <Accordion.Item value="payments">
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs font-semibold">Payment links <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition data-[state=open]:rotate-180" /></Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-2.5 pb-2 text-xs text-muted-foreground">
                    <p className="text-[11px]">Protected clinical payment workflow.</p>
                    <a className="mt-1 inline-block text-[11px] font-semibold text-primary" href="/app/appointments">Open billing →</a>
                  </Accordion.Content>
                </Accordion.Item>
              </Accordion.Root>
            </Tabs.Content>
            <Tabs.Content value="files" className="mt-2.5 rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              <FileText className="mx-auto h-4 w-4" />
              <p className="mt-1 text-[11px]">No files in this chat.</p>
            </Tabs.Content>
            <Tabs.Content value="care" className="mt-2.5">
              <Accordion.Root type="single" collapsible defaultValue="plan" className="rounded-lg border border-border">
                <Accordion.Item value="plan">
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs font-semibold">Care plan <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition data-[state=open]:rotate-180" /></Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-2.5 pb-2 text-xs text-muted-foreground">
                    <p className="text-[11px]">Care communication: {object(linked?.contact?.extra).care_communications_consent === false ? "not allowed" : "allowed"}.</p>
                    <a className="mt-1 inline-block text-[11px] font-semibold text-primary" href="/app/care-plans">Care plans →</a>
                  </Accordion.Content>
                </Accordion.Item>
              </Accordion.Root>
            </Tabs.Content>
          </Tabs.Root>
          <button className="mt-3 w-full rounded-md border border-input py-1.5 text-xs font-semibold hover:bg-muted" onClick={() => { setError(""); setContactEditorOpen(true); }}>{linked?.contact ? "Edit contact" : "Save contact"}</button>
        </div>
      ) : (
        <p className="p-3 text-xs text-muted-foreground">Select a conversation to see patient context.</p>
      )}
    </aside>
  );
}
