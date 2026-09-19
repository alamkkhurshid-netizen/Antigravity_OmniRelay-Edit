import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How OmniRelay collects, uses, shares and protects personal information.",
};

const sections = [
  {
    title: "Scope and who we are",
    paragraphs: [
      "This Privacy Policy explains how OmniRelay collects, uses, stores and shares personal information when people visit our website, create a workspace, connect a communications channel, use booking and automation features, or communicate with a business that uses OmniRelay.",
      "A business using OmniRelay generally controls the information about its own customers, patients or guests. OmniRelay processes that information on the business’s instructions. For account, product, security and website information, OmniRelay acts as the responsible service provider.",
    ],
  },
  {
    title: "Information we collect",
    items: [
      "Account and workspace information, including name, email address, profile image, login identifiers, business category, locations, services, team members and preferences.",
      "Customer and conversation information, including names, phone numbers, channel identifiers, messages, attachments, delivery status and communication consent.",
      "Booking information, including service, provider, location, date and time, notes, age, locality, pincode and health concern when a clinic chooses to collect it.",
      "Payment information such as payment status, amount, gateway order and transaction identifiers. OmniRelay does not store full card or UPI credentials.",
      "Integration information from services connected by a workspace, including Meta, WhatsApp, Instagram, Google and automation providers.",
      "Knowledge and AI information supplied to configure agents, including approved FAQs, policies, service descriptions, prompts, responses, evaluations and handoff records.",
      "Technical and usage information, including IP address, browser, device, authentication events, logs, webhook activity, feature usage and error diagnostics.",
    ],
  },
  {
    title: "How we use information",
    items: [
      "Provide authentication, workspaces, conversations, contacts, appointments, payments, reminders, automations and reporting.",
      "Transmit and receive messages through connected channels and show delivery or read status.",
      "Generate AI-assisted responses and recommendations from approved workspace information, with human handoff controls.",
      "Protect accounts, prevent abuse, enforce subscription limits and maintain audit and security records.",
      "Improve reliability, usability and product performance using aggregated or appropriately de-identified information.",
      "Send service, security, trial, billing and legal communications, and marketing only where permitted by consent and applicable law.",
    ],
  },
  {
    title: "Legal grounds and consent",
    paragraphs: [
      "Depending on the context and applicable law, we process information to perform a contract, operate the service at a customer’s request, comply with law, protect legitimate interests such as security and reliability, or based on consent. A business using OmniRelay is responsible for obtaining the notices and consents required for its communications, bookings, marketing and sensitive information.",
    ],
  },
  {
    title: "WhatsApp, Instagram and Meta data",
    paragraphs: [
      "When a workspace connects Meta products, OmniRelay processes authorized account identifiers, business account and phone-number identifiers, access credentials, messages and webhook events to provide the requested messaging service. We use this data only to operate the connected features, secure the integration, support the workspace and comply with Meta platform requirements.",
      "Meta and its services process information under their own terms and privacy policies. Disconnecting an integration stops future channel processing but does not automatically remove records that must be retained for security, billing, dispute resolution or legal compliance.",
    ],
  },
  {
    title: "AI and health-related information",
    paragraphs: [
      "OmniRelay may help a business answer questions, collect booking details and automate operational steps. AI output may be incomplete or incorrect and must not be treated as diagnosis, prescription, emergency advice or a substitute for a qualified professional.",
      "Clinic workspaces should collect only the minimum health-related information needed for scheduling or authorised care communications. Businesses remain responsible for clinical records, professional obligations, consent and applicable health-data requirements.",
    ],
  },
  {
    title: "How we share information",
    paragraphs: [
      "We do not sell personal information. We share information with a workspace and its authorised users, with communications and integration providers selected by that workspace, and with service providers that help us operate hosting, databases, authentication, payments, email, automation, analytics, support and AI features.",
      "Current or planned providers may include Meta, WhatsApp, Instagram, Google, Supabase, Razorpay, hosting infrastructure, n8n and configured AI providers. We may also disclose information where required by law, to protect rights and safety, or in connection with a business reorganisation subject to appropriate protections.",
    ],
  },
  {
    title: "Retention and security",
    paragraphs: [
      "We retain information only for as long as needed to provide the service, meet workspace instructions, maintain security and audit history, resolve disputes and comply with law. Retention periods vary by data type and workspace configuration.",
      "We use access controls, tenant isolation, row-level database security, encryption in transit, server-side credential storage, logging and least-privilege practices. No system is completely secure, and users must protect their credentials and promptly report suspected misuse.",
    ],
  },
  {
    title: "Your choices and rights",
    items: [
      "Request access, correction, portability or deletion of information where applicable.",
      "Withdraw consent or opt out of marketing without affecting prior lawful processing.",
      "Disconnect a channel, revoke third-party permissions or ask the business you contacted to action a request.",
      "Complain to an applicable data-protection authority.",
    ],
    paragraphs: [
      "If your information belongs to a business using OmniRelay, contact that business first because it controls the record. You may also contact us and we will help route or process the request after appropriate verification.",
    ],
  },
  {
    title: "Children, changes and contact",
    paragraphs: [
      "OmniRelay is a business service and is not directed to children. A business that handles a minor’s information must obtain appropriate guardian authority and comply with applicable law.",
      "We may update this Policy as the service and legal requirements evolve. Material changes will be communicated through the service or another appropriate channel. Questions and privacy requests may be sent to therasynergybiomedex@gmail.com.",
    ],
  },
];

export default function PrivacyPage() {
  return <LegalPage eyebrow="LEGAL · PRIVACY" title="Privacy Policy" summary="How OmniRelay handles information across conversations, bookings, connected channels, payments and AI-assisted workflows." sections={sections}/>;
}
