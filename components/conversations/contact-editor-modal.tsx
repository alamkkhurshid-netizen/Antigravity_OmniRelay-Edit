"use client";

import { FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Contact, ContactAddress, Conversation } from "@/app/app/conversations/types";
import { object } from "@/app/app/conversations/utils";

interface ContactEditorModalProps {
  active: Conversation | null;
  linked: { address: ContactAddress; contact: Contact | null } | null;
  setContactEditorOpen: (val: boolean) => void;
  saveContact: (e: FormEvent<HTMLFormElement>) => void;
  savingContact: boolean;
  error: string;
}

export function ContactEditorModal({
  active, linked, setContactEditorOpen, saveContact, savingContact, error
}: ContactEditorModalProps) {
  if (!active) return null;

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && setContactEditorOpen(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="contact-editor-backdrop" />
        <Dialog.Content asChild>
          <form className="contact-editor" onSubmit={saveContact}>
            <header>
              <div>
                <Dialog.Title className="app-eyebrow">{linked?.contact ? "EDIT CONTACT" : "SAVE CONTACT"}</Dialog.Title>
                <Dialog.Description asChild><h3>{active.contact_address}</h3></Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close">×</button>
              </Dialog.Close>
            </header>
        <label>
          Full name
          <input name="fullName" required defaultValue={linked?.contact?.name ?? active.name ?? ""} />
        </label>
        <label>
          Email
          <input name="email" type="email" defaultValue={String(object(linked?.contact?.extra).email ?? "")} />
        </label>
        <div className="contact-editor-row">
          <label>
            Age
            <input name="age" type="number" min="0" max="120" defaultValue={String(object(linked?.contact?.extra).age ?? "")} />
          </label>
          <label>
            PIN code
            <input name="pincode" inputMode="numeric" pattern="[0-9]{6}" defaultValue={String(object(linked?.contact?.extra).pincode ?? "")} />
          </label>
        </div>
        <label>
          Location
          <input name="locality" defaultValue={String(object(linked?.contact?.extra).locality ?? "")} />
        </label>
        <label>
          Health concern
          <input name="healthConcern" defaultValue={String(object(linked?.contact?.extra).health_concern ?? "")} />
        </label>
        <label className="contact-consent">
          <input name="careConsent" type="checkbox" defaultChecked={object(linked?.contact?.extra).care_communications_consent !== false} />
          <span><b>Care communication consent</b><small>Booking, revisit and medication reminders</small></span>
        </label>
        <label className="contact-consent">
          <input name="marketingConsent" type="checkbox" defaultChecked={object(linked?.contact?.extra).marketing_consent === true} />
          <span><b>Marketing consent</b><small>Education, offers and broadcast campaigns</small></span>
        </label>
        {error && <p>{error}</p>}
        <button className="contact-editor-save" disabled={savingContact}>{savingContact ? "Saving…" : linked?.contact ? "Save changes" : "Save contact"}</button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
