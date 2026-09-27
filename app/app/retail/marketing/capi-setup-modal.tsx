"use client";

import { useState } from "react";
import Script from "next/script";
import { Key, ShieldCheck, CheckCircle2, ChevronRight, X } from "lucide-react";

declare global {
  interface Window {
    FB: any;
  }
}

const FacebookIcon = ({ className, fill }: { className?: string; fill?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill={fill || "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

export function CapiSetupModal({ metaAppId }: { metaAppId?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"choose" | "manual" | "oauth">("choose");
  
  // Manual form state
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualStep, setManualStep] = useState(1);

  // Oauth state
  const [isOauthConnecting, setIsOauthConnecting] = useState(false);
  const [oauthSuccess, setOauthSuccess] = useState(false);

  // Handlers
  const handleManualSubmit = async () => {
    setIsSubmitting(true);
    // Simulate API call to save to Supabase
    setTimeout(() => {
      setIsSubmitting(false);
      setIsOpen(false);
      // window.location.reload(); 
    }, 1500);
  };

  const handleOauthConnect = () => {
    if (!metaAppId) {
      alert("Error: Meta App ID is missing from environment variables.");
      return;
    }
    
    if (typeof window === "undefined" || !window.FB) {
      alert("Facebook SDK is loading or blocked. Please try again in a moment.");
      return;
    }

    setIsOauthConnecting(true);
    
    window.FB.login((response: any) => {
      setIsOauthConnecting(false);
      if (response.authResponse) {
        setOauthSuccess(true);
        // Here we would securely send response.authResponse.accessToken to our backend
        setTimeout(() => {
          setIsOpen(false);
          setOauthSuccess(false);
        }, 3000);
      } else {
        // User cancelled or failed
        console.warn('User cancelled login or did not fully authorize.');
      }
    }, { scope: 'ads_management,business_management', config_id: process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID });
  };

  const closeModal = () => {
    setIsOpen(false);
    setActiveTab("choose");
    setManualStep(1);
    setOauthSuccess(false);
  };

  return (
    <>
      {metaAppId && (
        <Script 
          src="https://connect.facebook.net/en_US/sdk.js" 
          strategy="lazyOnload" 
          onLoad={() => {
            if (window.FB) {
              window.FB.init({
                appId: metaAppId,
                cookie: true,
                xfbml: true,
                version: 'v20.0'
              });
            }
          }}
        />
      )}
      
      <button 
        onClick={() => setIsOpen(true)}
        className="mt-4 flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-colors"
      >
        Connect Meta CAPI
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-5">
              <h2 className="text-lg font-bold text-slate-900">
                {activeTab === "choose" && "Connect Meta Conversions API"}
                {activeTab === "oauth" && "Connect with Facebook"}
                {activeTab === "manual" && "Manual Configuration"}
              </h2>
              <button 
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6">
              {/* CHOOSE PATH */}
              {activeTab === "choose" && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-slate-500 mb-2">
                    Choose how you want to connect your Meta Business Manager to OmniRelay for server-side tracking.
                  </p>
                  
                  {/* Option B: Automatic */}
                  <button 
                    onClick={() => setActiveTab("oauth")}
                    className="flex items-start gap-4 rounded-2xl border-2 border-blue-100 bg-blue-50/50 p-5 text-left transition-colors hover:border-blue-500 hover:bg-blue-50 group"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                      <FacebookIcon className="size-6" fill="currentColor" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900">One-Click Connect (Recommended)</h3>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">Easiest</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                        Log in with Facebook and grant OmniRelay permission to automatically configure your Pixel and Server tokens. No technical knowledge required.
                      </p>
                    </div>
                    <ChevronRight className="size-5 self-center text-slate-400 group-hover:text-blue-600" />
                  </button>

                  {/* Option A: Manual */}
                  <button 
                    onClick={() => setActiveTab("manual")}
                    className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm group"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Key className="size-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900">Manual Setup Wizard (Advanced)</h3>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                        Follow a step-by-step guide to copy your Pixel ID and System User Access Token directly from your Meta Events Manager.
                      </p>
                    </div>
                    <ChevronRight className="size-5 self-center text-slate-400 group-hover:text-slate-600" />
                  </button>
                </div>
              )}

              {/* OAUTH PATH */}
              {activeTab === "oauth" && (
                <div className="flex flex-col items-center py-8 text-center">
                  {!oauthSuccess ? (
                    <>
                      <div className="flex size-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 mb-6">
                        <FacebookIcon className="size-8" fill="currentColor" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">Connect Meta Business Manager</h3>
                      <p className="mt-2 max-w-sm text-sm text-slate-500">
                        You will be securely redirected to Facebook to authorize OmniRelay to manage your Conversions API.
                      </p>
                      
                      <div className="mt-8 w-full max-w-sm space-y-3 text-left bg-slate-50 rounded-xl p-4 text-sm border border-slate-100">
                        <div className="flex items-center gap-2 text-slate-700">
                          <ShieldCheck className="size-4 text-emerald-500" /> Secure OAuth 2.0 Connection
                        </div>
                        <div className="flex items-center gap-2 text-slate-700">
                          <ShieldCheck className="size-4 text-emerald-500" /> OmniRelay never sees your password
                        </div>
                      </div>

                      <div className="mt-8 flex gap-3">
                        <button onClick={() => setActiveTab("choose")} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Back</button>
                        <button 
                          onClick={handleOauthConnect}
                          disabled={isOauthConnecting}
                          className="flex items-center justify-center min-w-[220px] gap-2 rounded-xl bg-[#1877F2] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#0c63d4] transition-colors disabled:opacity-70"
                        >
                          {isOauthConnecting ? "Connecting to Facebook..." : "Continue with Facebook"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="animate-in fade-in zoom-in duration-300">
                      <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-6 mx-auto">
                        <CheckCircle2 className="size-8" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">Successfully Connected!</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        Your Pixel ID and Access Token have been securely configured automatically.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* MANUAL PATH */}
              {activeTab === "manual" && (
                <div className="flex flex-col">
                  {/* Progress Steps */}
                  <div className="flex items-center justify-between mb-8 relative px-4">
                    <div className="absolute top-1/2 left-8 right-8 h-0.5 bg-slate-100 -z-10 -translate-y-1/2"></div>
                    {[1, 2, 3].map((step) => (
                      <div key={step} className={`flex size-8 items-center justify-center rounded-full text-sm font-bold border-2 bg-white ${manualStep >= step ? 'border-indigo-600 text-indigo-600' : 'border-slate-200 text-slate-400'}`}>
                        {step}
                      </div>
                    ))}
                  </div>

                  {manualStep === 1 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h3 className="text-lg font-bold text-slate-900">Step 1: Get your Pixel ID</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        1. Go to <a href="https://business.facebook.com/events_manager2" target="_blank" className="text-blue-600 hover:underline font-semibold">Meta Events Manager</a><br/>
                        2. Select your Data Source (Pixel) on the left sidebar.<br/>
                        3. Go to the <strong>Settings</strong> tab and copy your Dataset ID (Pixel ID).
                      </p>
                      
                      <div className="aspect-video w-full rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center overflow-hidden shadow-inner">
                        <span className="text-xs font-bold tracking-widest text-slate-400 mb-3">EXAMPLE</span>
                        <div className="text-sm font-mono text-slate-600 bg-white p-3 rounded-lg shadow-sm border border-slate-200 flex flex-col gap-1 text-center">
                          <span className="text-xs text-slate-400 font-sans uppercase">Dataset ID</span>
                          <span className="font-bold text-slate-900">102938475610293</span>
                        </div>
                      </div>
                      
                      <div className="pt-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Your Pixel ID</label>
                        <input 
                          type="text" 
                          value={pixelId}
                          onChange={(e) => setPixelId(e.target.value)}
                          placeholder="e.g. 102938475610293" 
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="mt-6 flex gap-3 justify-end">
                        <button onClick={() => setActiveTab("choose")} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                        <button onClick={() => setManualStep(2)} disabled={!pixelId} className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-all">Next Step</button>
                      </div>
                    </div>
                  )}

                  {manualStep === 2 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                      <h3 className="text-lg font-bold text-slate-900">Step 2: Generate Access Token</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        1. Scroll down on that same <strong>Settings</strong> tab to the <strong>Conversions API</strong> section.<br/>
                        2. Click the link that says <strong className="text-blue-600">Generate access token</strong>.<br/>
                        3. Copy the incredibly long string of text that is generated.
                      </p>
                      
                      <div className="aspect-[21/9] w-full rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center overflow-hidden shadow-inner px-8">
                         <span className="text-xs font-bold tracking-widest text-slate-400 mb-3">EXAMPLE</span>
                        <div className="text-xs font-mono text-slate-600 bg-white p-3 rounded-lg shadow-sm border border-slate-200 text-center w-full truncate">
                          EAAGm0PX4ZCxyzABC123...
                        </div>
                      </div>
                      
                      <div className="pt-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Access Token</label>
                        <textarea 
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          placeholder="EAAGm0PX4ZC..." 
                          rows={3}
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="mt-6 flex gap-3 justify-end">
                        <button onClick={() => setManualStep(1)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Back</button>
                        <button onClick={() => setManualStep(3)} disabled={!accessToken} className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-all">Review & Save</button>
                      </div>
                    </div>
                  )}

                  {manualStep === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                      <div className="text-center pt-4">
                        <ShieldCheck className="size-14 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-slate-900">Ready to Connect</h3>
                        <p className="text-sm text-slate-500 mt-2">Your credentials will be encrypted at rest in our secure vault.</p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-5 shadow-sm">
                        <div>
                          <span className="block text-xs font-black tracking-wider text-slate-500 mb-1">PIXEL ID</span>
                          <span className="font-mono text-sm text-slate-900 font-semibold">{pixelId}</span>
                        </div>
                        <div>
                          <span className="block text-xs font-black tracking-wider text-slate-500 mb-1">ACCESS TOKEN</span>
                          <div className="font-mono text-xs text-slate-700 break-all bg-white p-2 rounded border border-slate-200">
                            {accessToken.substring(0, 40)}...
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 justify-end pt-2">
                        <button onClick={() => setManualStep(2)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Back</button>
                        <button 
                          onClick={handleManualSubmit} 
                          disabled={isSubmitting} 
                          className="flex items-center min-w-[180px] justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-80 transition-all shadow-sm"
                        >
                          {isSubmitting ? "Encrypting..." : "Save Credentials"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
