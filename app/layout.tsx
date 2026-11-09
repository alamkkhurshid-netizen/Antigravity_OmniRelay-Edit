import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PwaRegistry } from "../components/pwa-registry";
import "./globals.css";
import "./impact.css";
import "./calendar.css";
import "./clinical-completion.css";
import "./booking.css";
import "./action-centre-actions.css";
import "./readiness.css";
import "./whatsapp-calculator.css";
import "./whatsapp-calculator-layout.css";
import "./billing-controls.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#071426",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "OmniRelay — Connect. Automate. Grow.",
    template: "%s | OmniRelay",
  },
  description:
    "Omnichannel conversations, AI agents, bookings and automation for modern service businesses.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/omnirelay-favicon-square-v5.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/omnirelay-favicon-square-v5.png",
    apple: [
      { url: "/pwa-assets/apple-icon-180.png", sizes: "180x180", type: "image/png" },
      { url: "/omnirelay-app-icon-v4.png", sizes: "512x512", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OmniRelay",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased font-sans">
        {children}
        <PwaRegistry />
        <SpeedInsights />
      </body>
    </html>
  );
}
