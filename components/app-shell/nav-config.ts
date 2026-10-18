import {
  BellRing,
  BookOpen,
  BookOpenCheck,
  Bot,
  Building2,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  ClipboardList,
  ContactRound,
  CreditCard,
  HeartPulse,
  House,
  LineChart,
  Megaphone,
  MessagesSquare,
  Package,
  PlugZap,
  Radar,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Users,
  UsersRound,
  Workflow,
} from "lucide-react";

export type NavItem = readonly [
  label: string,
  href: string,
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
];

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const navGroups: ReadonlyArray<NavGroup> = [
  {
    label: "Workspace",
    items: [
      ["Overview", "/app", House],
      ["Analytics & Insights", "/app/analytics", LineChart],
      ["Action centre", "/app/action-centre", CircleAlert],
    ],
  },
  {
    label: "Patient care",
    items: [
      ["Conversations", "/app/conversations", MessagesSquare],
      ["Contacts", "/app/contacts", ContactRound],
      ["Care plans", "/app/care-plans", HeartPulse],
      ["Appointments", "/app/appointments", CalendarDays],
      ["Clinic operations", "/app/clinic-operations", Building2],
      ["Booking concierge", "/app/booking-concierge", CalendarClock],
    ],
  },
  {
    label: "Automation & engagement",
    items: [
      ["Care reminders", "/app/automations", BellRing],
      ["Campaigns", "/app/campaigns", Megaphone],
      ["Knowledge base", "/app/knowledge", BookOpen],
      ["Integrations", "/app/integrations", PlugZap],
      ["AI agents", "/app/agents", Bot],
    ],
  },
  {
    label: "Administration",
    items: [
      ["Team operations", "/app/team", UsersRound],
      ["Operations", "/app/operations", ShieldCheck],
      ["Go-live readiness", "/app/readiness", BookOpenCheck],
      ["Activity logs", "/app/activity", ClipboardList],
      ["Business setup", "/app/settings", Settings2],
      ["Plans & billing", "/app/billing", CreditCard],
    ],
  },
];

export const retailNavGroups: ReadonlyArray<NavGroup> = [
  {
    label: "Store Operations",
    items: [
      ["Store Hub", "/app/retail", Store],
      ["Order Pipeline", "/app/retail/orders", Package],
      ["Digital Catalog", "/app/retail/catalog", ShoppingBag],
      ["Revenue Analytics", "/app/retail/analytics", TrendingUp],
    ],
  },
  {
    label: "Customers & Chat",
    items: [
      ["Customer CRM", "/app/retail/customers", Users],
      ["Live Conversations", "/app/conversations", MessagesSquare],
    ],
  },
  {
    label: "WhatsApp Automation",
    items: [
      ["Flow Builder", "/app/retail/flows", Workflow],
      ["Broadcast Campaigns", "/app/retail/broadcasts", Megaphone],
      ["Commerce AI Agents", "/app/agents", Bot],
    ],
  },
  {
    label: "Marketing & Growth",
    items: [
      ["Meta Ads Autopilot", "/app/retail/marketing", Target],
      ["Creative Engine", "/app/retail/creative", Sparkles],
      ["Content Calendar", "/app/retail/calendar", CalendarDays],
      ["Trend Radar", "/app/retail/trends", Radar],
    ],
  },
  {
    label: "Store Settings",
    items: [
      ["Business Setup", "/app/settings", Settings2],
      ["Integrations", "/app/integrations", PlugZap],
      ["Plans & Billing", "/app/billing", CreditCard],
      ["Team Operations", "/app/team", UsersRound],
    ],
  },
];

export const titles: Record<string, string> = {
  "/app": "Overview",
  "/app/analytics": "Analytics & Insights",
  "/app/action-centre": "Action centre",
  "/app/conversations": "Conversations",
  "/app/contacts": "Contacts",
  "/app/care-plans": "Care plans",
  "/app/team": "Team operations",
  "/app/appointments": "Appointments",
  "/app/clinic-operations": "Clinic operations",
  "/app/booking-concierge": "WhatsApp booking concierge",
  "/app/agents": "AI agents",
  "/app/automations": "Medication & follow-up reminders",
  "/app/campaigns": "Campaigns",
  "/app/operations": "Operations centre",
  "/app/readiness": "Clinic go-live readiness",
  "/app/integrations": "Integrations",
  "/app/activity": "Activity logs",
  "/app/settings": "Business setup",
  "/app/billing": "Plans & billing",
  "/app/retail": "Store Hub",
  "/app/retail/orders": "Order Pipeline",
  "/app/retail/catalog": "Digital Catalog",
  "/app/retail/analytics": "Revenue Analytics",
  "/app/retail/customers": "Customer CRM",
  "/app/retail/flows": "Flow Builder",
  "/app/retail/broadcasts": "Broadcast Campaigns",
  "/app/retail/marketing": "Meta Ads Autopilot",
  "/app/retail/creative": "Creative Velocity Engine",
  "/app/retail/calendar": "Content Calendar",
  "/app/retail/trends": "Trend Radar",
};

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  priority: string;
  escalation_level: number;
  created_at: string;
}

export interface WhatsAppRate {
  message_category: string;
  base_rate_paise: number | string;
  platform_fee_paise: number | string;
  source_version: string;
  verification_status?: "draft" | "verified";
}

export const notificationHref = (href: string | null) =>
  href === "/app/action-centre" ? "/app/action-centre#priority-review-queue" : href ?? "/app/team";

export const notificationTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
