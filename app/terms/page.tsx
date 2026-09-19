import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing access to and use of OmniRelay.",
};

const sections = [
  {
    title: "Agreement and eligibility",
    paragraphs: [
      "These Terms govern access to OmniRelay’s websites, workspaces, communications, bookings, automations, AI and related services. By creating an account, connecting an integration or using the service, you agree to these Terms and confirm that you have authority to bind the business you represent.",
      "You must be legally capable of entering a contract and provide accurate account and business information. If you do not agree, do not use the service.",
    ],
  },
  {
    title: "Accounts and workspaces",
    items: [
      "Keep login credentials, connected-channel permissions and recovery methods secure.",
      "Use role and access settings appropriately and promptly remove users who no longer require access.",
      "Accept responsibility for activity performed through your workspace, except to the extent caused by OmniRelay’s breach.",
      "Notify us promptly about suspected unauthorised access or security incidents.",
    ],
  },
  {
    title: "Acceptable use",
    paragraphs: ["You may use OmniRelay only for lawful business purposes and in compliance with applicable privacy, consumer, marketing, healthcare, telecommunications and platform rules."],
    items: [
      "Do not send spam, deceptive communications, unlawful marketing or messages without the required consent.",
      "Do not upload malware, probe security, interfere with the service, evade limits or access another tenant’s data.",
      "Do not use the service to discriminate, harass, exploit, impersonate or cause harm.",
      "Do not submit information you are not authorised to collect, process or share.",
      "Do not rely on AI output for emergencies, diagnosis, prescribing, legal decisions or other high-impact decisions without qualified human review.",
    ],
  },
  {
    title: "Connected platforms",
    paragraphs: [
      "Features that use WhatsApp, Instagram, Facebook, Google, payment gateways, automation systems or other services require a valid account with that provider. You authorise OmniRelay to act on the permissions you grant.",
      "You must follow each provider’s terms, policies, message-template rules, consent requirements and technical limits. Third-party availability and approval decisions are outside OmniRelay’s control, and providers may change or discontinue functionality.",
    ],
  },
  {
    title: "Bookings, payments and reminders",
    paragraphs: [
      "OmniRelay helps businesses publish availability, accept bookings, collect payment through configured gateways and send operational reminders. The business is responsible for the accuracy of services, prices, schedules, refund policies, provider availability and fulfilment.",
      "Payment processing is provided by the selected gateway. OmniRelay does not hold full payment credentials and is not the merchant, healthcare provider or contracting service provider between a business and its customer.",
    ],
  },
  {
    title: "Healthcare and emergency disclaimer",
    paragraphs: [
      "OmniRelay is an operational communications and scheduling platform. It is not a healthcare provider, medical device, emergency service or clinical record system unless separately agreed and configured.",
      "AI agents and automations must not diagnose, prescribe or replace professional judgement. In an emergency, users must contact local emergency services or an appropriate qualified professional. Clinics remain responsible for patient consent, care, records and regulatory obligations.",
    ],
  },
  {
    title: "Trials, subscriptions and taxes",
    paragraphs: [
      "A trial may be limited by time, features, channels or usage. Continued access after a trial may require a paid subscription. Plan features, usage limits and prices shown at purchase form part of these Terms.",
      "Fees are charged through the selected payment method and may be non-refundable except where required by law or expressly stated. You are responsible for applicable taxes. We may suspend paid functionality for overdue amounts after appropriate notice.",
    ],
  },
  {
    title: "Customer data and intellectual property",
    paragraphs: [
      "You retain rights in data and content you submit. You grant OmniRelay the limited rights needed to host, process, transmit, secure and support that content and to follow your authorised instructions.",
      "OmniRelay and its licensors retain rights in the platform, software, brand, designs, documentation and improvements. Feedback may be used to improve the service without restriction or payment, provided it does not disclose confidential customer information.",
    ],
  },
  {
    title: "Availability, suspension and termination",
    paragraphs: [
      "We aim to operate a reliable service but do not promise uninterrupted or error-free availability. Maintenance, internet failures, third-party outages and force-majeure events may affect service.",
      "We may restrict or suspend access to protect security, prevent abuse, comply with law or address material breach. You may stop using the service and request account deletion. Provisions that by nature should survive termination will continue, including payment, ownership, disclaimers and liability terms.",
    ],
  },
  {
    title: "Disclaimers and liability",
    paragraphs: [
      "To the extent permitted by law, the service is provided on an “as available” basis. AI output, automation results, availability calculations and third-party data should be reviewed before reliance.",
      "Neither party will be liable for indirect, incidental, special or consequential loss where such exclusion is lawful. OmniRelay’s aggregate liability arising from the service will not exceed the fees paid for the service during the six months preceding the event giving rise to the claim, except where liability cannot lawfully be limited.",
    ],
  },
  {
    title: "Changes, law and contact",
    paragraphs: [
      "We may update these Terms as the service evolves. Material changes will be communicated through the service or another appropriate channel. Continued use after the effective date constitutes acceptance where permitted by law.",
      "These Terms are governed by the laws of India, without limiting mandatory consumer or data-protection rights. Courts of competent jurisdiction in India may hear disputes. Questions may be sent to therasynergybiomedex@gmail.com.",
    ],
  },
];

export default function TermsPage() {
  return <LegalPage eyebrow="LEGAL · SERVICE" title="Terms of Service" summary="The rules and responsibilities that keep OmniRelay secure, compliant and useful for every business and customer." sections={sections}/>;
}
