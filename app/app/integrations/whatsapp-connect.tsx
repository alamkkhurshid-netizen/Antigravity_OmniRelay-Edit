"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type SignupData = {
  phoneNumberId?: string;
  wabaId?: string;
  businessId?: string;
  flowType?: "only_waba" | "new_phone_number" | "existing_phone_number";
};

export function WhatsAppConnect({ appId, configurationId, connected, displayAddress, onboardingMode }: {
  appId: string;
  configurationId?: string;
  connected: boolean;
  displayAddress?: string | null;
  onboardingMode?: string | null;
}) {
  const router = useRouter();
  const signupData = useRef<SignupData>({});
  const metaDialogOpened = useRef(false);
  const dialogWatch = useRef<number | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [state, setState] = useState<"idle" | "starting" | "authorizing" | "provisioning" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  function clearDialogWatch() {
    if (dialogWatch.current !== null) {
      window.clearTimeout(dialogWatch.current);
      dialogWatch.current = null;
    }
  }

  useEffect(() => {
    // A Meta SDK login opens a separate secure window.  If the browser never
    // loses focus, report that exact condition instead of leaving the clinic
    // owner in a misleading permanent "Connecting" state.
    const markMetaDialogOpened = () => {
      metaDialogOpened.current = true;
      clearDialogWatch();
    };
    window.addEventListener("blur", markMetaDialogOpened);
    return () => {
      window.removeEventListener("blur", markMetaDialogOpened);
      clearDialogWatch();
    };
  }, []);

  useEffect(() => {
    const receiveMessage = (event: MessageEvent) => {
      if (!["https://www.facebook.com", "https://web.facebook.com"].includes(event.origin)) return;
      let data = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH") {
        clearDialogWatch();
        signupData.current = {
          phoneNumberId: data.data?.phone_number_id,
          wabaId: data.data?.waba_id,
          businessId: data.data?.business_id,
          flowType: data.data?.flow_type,
        };
      } else if (data.event === "CANCEL") {
        clearDialogWatch();
        setState("idle");
        setMessage("Connection was cancelled. No changes were made.");
      } else if (data.event === "ERROR") {
        clearDialogWatch();
        setState("error");
        setMessage(data.data?.error_message ?? "Meta could not complete the connection.");
      }
    };
    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, []);

  useEffect(() => {
    if (!configurationId) return;
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, cookie: true, xfbml: false, version: "v25.0" });
      setSdkReady(true);
    };
    if (document.getElementById("facebook-jssdk")) {
      window.fbAsyncInit();
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    document.body.appendChild(script);
  }, [appId, configurationId]);

  async function completeMetaLogin(response: { authResponse?: { code?: string } }) {
    const code = response.authResponse?.code;
    const ids = signupData.current;
    if (!code) {
      setState("idle");
      setMessage("Meta authorization was not completed.");
      return;
    }
    if (!ids.phoneNumberId || !ids.wabaId) {
      setState("error");
      setMessage("Meta authorized access but did not return the WhatsApp account details. Please retry.");
      return;
    }
    setState("provisioning");
    setMessage("Securing the connection session…");
    const sessionResponse = await fetch("/api/whatsapp/onboarding-session", { method: "POST" });
    const session = await sessionResponse.json() as { token?: string; error?: string };
    if (!sessionResponse.ok || !session.token) {
      setState("error");
      setMessage(session.error ?? "Could not start the secure connection session.");
      return;
    }
    setMessage("Registering the number, subscribing webhooks and securing the tenant mapping…");
    const finalizeResponse = await fetch("/api/whatsapp/embedded-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: session.token, code, ...ids }),
    });
    const result = await finalizeResponse.json() as { error?: string; phoneNumber?: string };
    if (!finalizeResponse.ok) {
      setState("error");
      setMessage(result.error ?? "WhatsApp connection failed.");
      return;
    }
    setState("done");
    setMessage(`Connected${result.phoneNumber ? `: ${result.phoneNumber}` : ""}.`);
    router.refresh();
  }

  function connect() {
    if (!configurationId || !window.FB) return;
    metaDialogOpened.current = false;
    clearDialogWatch();
    setState("authorizing");
    setMessage("Complete the Meta steps in the secure popup.");
    // FB.login must run synchronously inside the click handler. Meta also
    // requires this callback itself to be a plain function, not async.
    try {
      window.FB.login((response) => {
        clearDialogWatch();
        void completeMetaLogin(response).catch(() => {
          setState("error");
          setMessage("Meta authorization completed, but OmniRelay could not finish the secure connection. No WhatsApp account was changed.");
        });
      }, {
        config_id: configurationId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
      });
      dialogWatch.current = window.setTimeout(() => {
        if (metaDialogOpened.current) return;
        setState("error");
        setMessage("Meta did not open its secure connection window. No WhatsApp account was changed. This points to the Meta Embedded Signup configuration, not your clinic setup.");
      }, 5000);
    } catch (error) {
      // Meta throws synchronously for launch/configuration failures. Its
      // message contains no credential, but is the one actionable signal the
      // clinic owner needs when the dialog never gets a chance to open.
      const detail = error instanceof Error && error.message
        ? error.message.replace(/[\r\n]+/g, " ").slice(0, 220)
        : "Unknown Meta SDK error";
      console.error("Meta Embedded Signup launch failed", error);
      setState("error");
      setMessage(`Meta could not start the secure connection window: ${detail}. No WhatsApp account was changed.`);
    }
  }

  if (connected) {
    const coexistence=onboardingMode==="existing_phone_number";
    return <div className="embedded-signup connected"><div><span>CONNECTED NUMBER</span><b>{displayAddress || "WhatsApp Business"}</b><small>{coexistence?"Coexistence active: WhatsApp Business app and OmniRelay inbox can work with this number.":"Cloud API active: webhooks and tenant routing are ready."}</small><p className="connect-message done">This connection is tenant-scoped. Only the workspace owner can change it. Disconnecting an existing Business app number requires a guided support action so the clinic does not lose service.</p></div><i>{coexistence?"COEXISTENCE":"LIVE"}</i></div>;
  }
  if (!configurationId) {
    return <div className="embedded-signup pending"><div><span>EMBEDDED SIGNUP + COEXISTENCE</span><b>Meta Configuration ID required</b><small>The secure onboarding flow is installed. Add the approved Meta configuration to let clinics connect an existing WhatsApp Business app number without losing the app workflow.</small></div><button disabled>Connect WhatsApp</button></div>;
  }
  return <div className="embedded-signup"><div><span>SELF-SERVICE CONNECTION</span><b>Connect WhatsApp Business</b><small>Recommended: keep the existing WhatsApp Business app through Meta Coexistence. Meta will show the eligible connection choices and the business owner grants permission directly.</small>{message && <p className={`connect-message ${state}`}>{message}</p>}</div><button onClick={connect} disabled={!sdkReady || !["idle", "error"].includes(state)}>{state === "idle" || state === "error" ? "Connect with Meta →" : "Connecting…"}</button></div>;
}
