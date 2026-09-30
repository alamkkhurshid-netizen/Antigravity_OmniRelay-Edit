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
        <div className="p-4">
          <div className="border-b border-border pb-4 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary text-xl font-bold text-secondary-foreground">{activeName.slice(0, 1).toUpperCase()}</span>
            <h2 className="mt-3 text-base font-semibold">{activeName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{active.ai_paused ? "Human takeover active" : "AI assist ready"}</p>
          </div>
          <Tabs.Root defaultValue="info" className="mt-4">
            <Tabs.List className="grid grid-cols-3 rounded-lg bg-muted p-1" aria-label="Patient context">
              <Tabs.Trigger value="info" className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground data-[state=active]:bg-panel data-[state=active]:text-foreground data-[state=active]:shadow-sm">Info</Tabs.Trigger>
              <Tabs.Trigger value="files" className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground data-[state=active]:bg-panel data-[state=active]:text-foreground data-[state=active]:shadow-sm">Files</Tabs.Trigger>
              <Tabs.Trigger value="care" className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground data-[state=active]:bg-panel data-[state=active]:text-foreground data-[state=active]:shadow-sm">Care</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="info" className="mt-4">
              <Accordion.Root type="multiple" defaultValue={["general", "appointments"]} className="divide-y divide-border rounded-xl border border-border">
                <Accordion.Item value="general">
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold">General information <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180" /></Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-3 pb-3 text-sm text-muted-foreground">
                    <div className="grid grid-cols-[1rem_1fr] gap-x-2 gap-y-2">
                      <Phone className="h-4 w-4" /><span>{active.contact_address ?? "No WhatsApp number"}</span>
                      <MapPin className="h-4 w-4" /><span>{String(object(linked?.contact?.extra).locality ?? "Location not added")}</span>
                      <Info className="h-4 w-4" /><span>{assigned?.name ?? "Unassigned"} · {active.status}</span>
                    </div>
                  </Accordion.Content>
                </Accordion.Item>
                <Accordion.Item value="appointments">
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold">Upcoming appointments <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180" /></Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-3 pb-3 text-sm text-muted-foreground">
                    <p>Open the appointment workspace to view confirmed booking details.</p>
                    <a className="mt-2 inline-block text-xs font-semibold text-primary" href="/app/appointments">Open appointments →</a>
                  </Accordion.Content>
                </Accordion.Item>
                <Accordion.Item value="payments">
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold">Payment links <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180" /></Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-3 pb-3 text-sm text-muted-foreground">
                    <p>Payment status remains in the protected payment workflow.</p>
                    <a className="mt-2 inline-block text-xs font-semibold text-primary" href="/app/appointments">Open payment workflow →</a>
                  </Accordion.Content>
                </Accordion.Item>
              </Accordion.Root>
            </Tabs.Content>
            <Tabs.Content value="files" className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto h-5 w-5" />
              <p className="mt-2">No files shared in this conversation.</p>
            </Tabs.Content>
            <Tabs.Content value="care" className="mt-4">
              <Accordion.Root type="single" collapsible defaultValue="plan" className="rounded-xl border border-border">
                <Accordion.Item value="plan">
                  <Accordion.Header>
                    <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold">Care plan <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180" /></Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="px-3 pb-3 text-sm text-muted-foreground">
                    <p>Care communication: {object(linked?.contact?.extra).care_communications_consent === false ? "not allowed" : "allowed"}.</p>
                    <a className="mt-2 inline-block text-xs font-semibold text-primary" href="/app/care-plans">Open care plans →</a>
                  </Accordion.Content>
                </Accordion.Item>
              </Accordion.Root>
            </Tabs.Content>
          </Tabs.Root>
          <button className="mt-4 w-full rounded-lg border border-input px-3 py-2 text-sm font-semibold hover:bg-muted" onClick={() => { setError(""); setContactEditorOpen(true); }}>{linked?.contact ? "Edit contact" : "Save contact"}</button>
        </div>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Select a conversation to see patient context.</p>
      )}
    </aside>
  );
}
