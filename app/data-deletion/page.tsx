import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "User Data Deletion",
  description: "Instructions for requesting deletion of data associated with OmniRelay.",
};

const sections = [
  {
    title: "Request deletion",
    paragraphs: [
      "You can request deletion of your OmniRelay account and associated personal information by emailing therasynergybiomedex@gmail.com with the subject “OmniRelay data deletion request”. Send the request from the email address connected to your OmniRelay account whenever possible.",
      "Include your full name, account email, workspace or business name, and whether you want the entire account deleted or only information associated with a connected Meta, WhatsApp, Instagram or Facebook account. Do not send passwords, access tokens, payment credentials or medical documents by email.",
    ],
  },
  {
    title: "If you contacted an OmniRelay business",
    paragraphs: [
      "If you are a patient, customer or guest who communicated with a business using OmniRelay, contact that business first. The business controls its customer, booking and conversation records and can identify the correct information.",
      "You may also email us with the business name, your phone or channel identifier and an approximate interaction date. We will verify and route the request to the relevant business or assist it in completing the request.",
    ],
  },
  {
    title: "Disconnect Meta permissions",
    items: [
      "Open Facebook or Meta Accounts Center and review Apps and Websites or Business Integrations.",
      "Select OmniRelay and remove the permissions you no longer wish to grant.",
      "Removing permissions stops future authorised access but does not by itself delete information already lawfully stored in an OmniRelay workspace.",
      "Submit the deletion request described above if you also want stored OmniRelay data removed.",
    ],
  },
  {
    title: "Verification",
    paragraphs: [
      "To protect users and prevent fraudulent deletion, we may ask you to confirm ownership of the account, email address, phone number, connected business or channel identity. We will request only the minimum information needed for verification.",
      "An authorised agent may submit a request where permitted, but we may require evidence of authority and direct identity confirmation from the person concerned.",
    ],
  },
  {
    title: "What we delete",
    items: [
      "Account profile and workspace membership information associated with the verified request.",
      "Connected-channel identifiers and credentials controlled by OmniRelay.",
      "Conversation, contact, booking, knowledge, automation and configuration data controlled by the requesting workspace, subject to the limitations below.",
      "Derived or cached personal information that can reasonably be associated with the verified account.",
    ],
  },
  {
    title: "Timing and confirmation",
    paragraphs: [
      "We aim to acknowledge verified requests promptly and complete deletion within 30 days. Complex requests, legal requirements or coordination with a business customer may require additional time; we will communicate where an extension is necessary.",
      "After completion, we will send confirmation to the verified contact method. Deletion is permanent and deleted workspace information may not be recoverable.",
    ],
  },
  {
    title: "Information we may retain",
    paragraphs: [
      "We may retain limited information where necessary for legal compliance, taxation, fraud prevention, security, dispute resolution, enforcement of agreements or proof that a request was completed. Backup copies may remain for a limited recovery cycle before secure deletion or isolation.",
      "We may retain aggregated or de-identified information that can no longer reasonably identify a person. Payment providers and connected platforms process their own records under their respective policies.",
    ],
  },
  {
    title: "Questions or complaints",
    paragraphs: [
      "For questions about deletion, correction, access or privacy, email therasynergybiomedex@gmail.com. If you believe a request has not been handled appropriately, you may also contact the relevant business or an applicable data-protection authority.",
    ],
  },
];

export default function DataDeletionPage() {
  return <LegalPage eyebrow="PRIVACY · USER CONTROL" title="User Data Deletion" summary="A clear process for removing an OmniRelay account, connected Meta data or customer information held in a business workspace." sections={sections}/>;
}
