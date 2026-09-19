"use client";

import { useEffect } from "react";

/**
 * Registers only the privacy-safe PWA shell. It does not cache workspace or
 * patient data, and it cannot receive pushes until a future consented
 * subscription and server-side delivery slice are enabled.
 */
export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/omnirelay-sw.js", { scope: "/" }).catch(() => {
      // PWA support is optional; the authenticated workspace continues normally.
    });
  }, []);

  return null;
}
