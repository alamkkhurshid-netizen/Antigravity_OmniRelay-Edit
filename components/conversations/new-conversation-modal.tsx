"use client";

import { FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Connection, Template } from "@/app/app/conversations/types";

interface NewConversationModalProps {
  templateTarget: { phone: string; name: string } | null;
  activeId: string | null;
  setNewConversationOpen: (val: boolean) => void;
  startConversation: (e: FormEvent<HTMLFormElement>) => void;
  connection: Connection;
  templates: Template[];
  selectedTemplateId: string;
  setSelectedTemplateId: (val: string) => void;
  organizationName: string;
  startingConversation: boolean;
  error: string;
}

export function NewConversationModal({
  templateTarget, activeId, setNewConversationOpen, startConversation, connection,
  templates, selectedTemplateId, setSelectedTemplateId, organizationName, startingConversation, error
}: NewConversationModalProps) {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedVariables = Object.entries(selectedTemplate?.variable_map ?? {})
    .sort(([left], [right]) => Number(left) - Number(right));

  const variableDefault = (name: string) => {
    if (name === "patient_name") return templateTarget?.name ?? "";
    if (name === "business_name") return organizationName;
    return "";
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && setNewConversationOpen(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="contact-editor-backdrop" />
        <Dialog.Content asChild>
          <form key={`${templateTarget?.phone ?? "new"}-${activeId ?? "none"}`} className="contact-editor outbound-editor" onSubmit={startConversation}>
            <header>
              <div>
                <Dialog.Title className="app-eyebrow">OUTBOUND WHATSAPP</Dialog.Title>
                <Dialog.Description asChild><h3>Start a conversation</h3></Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close">×</button>
              </Dialog.Close>
            </header>
        <p className="outbound-policy-note">WhatsApp requires an approved template to start a conversation. Free-form replies unlock after the customer responds.</p>
        <label>
          Mobile number with country code
          <input name="phone" inputMode="tel" placeholder="919831582626" required pattern="[+0-9 ()-]{10,20}" defaultValue={templateTarget?.phone ?? ""} />
        </label>
        <label>
          Contact name
          <input name="name" placeholder="Customer name" defaultValue={templateTarget?.name ?? ""} />
        </label>
        <label>
          Approved template
          <select name="templateId" required value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
            <option value="" disabled>Select an approved template</option>
            {connection?.status === "test" && <option value="hello_world">Meta test message · hello_world</option>}
            {templates.map((template) => <option value={template.id} key={template.id}>{template.event_type.replaceAll("_", " ")} · {template.provider_template_name}</option>)}
          </select>
        </label>
        {selectedTemplateId !== "hello_world" && selectedVariables.map(([position, name]) => (
          <label key={position}>
            {name.replaceAll("_", " ")}
            <input name={`variable:${position}`} required defaultValue={variableDefault(name)} placeholder={`Value for {{${position}}}`} />
          </label>
        ))}
        <label>
          Consent source
          <select name="consentSource" required defaultValue="">
            <option value="" disabled>Select how consent was received</option>
            <option value="customer_request">Customer requested contact</option>
            <option value="booking_form">Booking form opt-in</option>
            <option value="written">Written consent</option>
            <option value="existing_relationship">Existing customer relationship</option>
          </select>
        </label>
        <label className="contact-consent">
          <input name="consentConfirmed" type="checkbox" required />
          <span><b>I confirm this person agreed to receive WhatsApp messages</b><small>OmniRelay records the source, time and team member for audit purposes.</small></span>
        </label>
        {error && <p>{error}</p>}
        <button className="contact-editor-save" disabled={startingConversation}>{startingConversation ? "Starting…" : "Send approved template"}</button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
