import type { Metadata } from "next";
import { PatientPortal } from "./patient-portal";

export const metadata: Metadata = {
  title: "Secure patient portal",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PatientPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <PatientPortal token={token} />;
}
