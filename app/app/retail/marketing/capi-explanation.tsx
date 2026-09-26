"use client";

import { useState } from "react";
import { Info, Calculator, X, TrendingUp } from "lucide-react";

export function CapiExplanation() {
  const [isOpen, setIsOpen] = useState(false);
  const [adSpend, setAdSpend] = useState(1000);
  const [currentROAS, setCurrentROAS] = useState(2.0); // Return on Ad Spend

  // The math: Without CAPI, iOS blocks ~30% of signals. With CAPI, accuracy increases, FB AI gets smarter, resulting in better ROAS. 
  // Let's assume CAPI improves ROAS by 25%.
  const currentRevenue = adSpend * currentROAS;
  const currentProfit = currentRevenue - adSpend;
  
  const optimizedROAS = currentROAS * 1.25;
  const optimizedRevenue = adSpend * optimizedROAS;
  const optimizedProfit = optimizedRevenue - adSpend;
  
  const additionalProfit = optimizedProfit - currentProfit;

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
      >
        <Info className="size-4" /> See how this saves you money
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden my-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <Calculator className="size-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">The Power of Server-Side Tracking</h2>
                  <p className="text-sm text-slate-500">How OmniRelay makes your ads profitable</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="grid md:grid-cols-2">
              {/* Explanation Side */}
              <div className="p-8 bg-slate-50 border-r border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Why do you need this?</h3>
                
                <div className="space-y-8">
                  <div className="flex gap-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 font-bold">1</div>
                    <div>
                      <h4 className="font-semibold text-slate-900">The Problem (Without OmniRelay)</h4>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                        When a customer on an iPhone clicks your ad and buys, Apple blocks the tracking. Facebook thinks the ad failed and stops showing it to good buyers. You waste money on ineffective ads.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 font-bold">2</div>
                    <div>
                      <h4 className="font-semibold text-slate-900">The Solution (With OmniRelay)</h4>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                        OmniRelay bypasses the iPhone entirely. Our secure backend servers talk directly to Facebook&apos;s servers to confirm the purchase details safely. 
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold">3</div>
                    <div>
                      <h4 className="font-semibold text-slate-900">The Result</h4>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                        Facebook gets 100% accurate data. Their AI gets smarter, your ads become significantly cheaper, and your business scales profitably on autopilot.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Calculator Side */}
              <div className="p-8">
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <TrendingUp className="size-5 text-emerald-500" /> Calculate Your Savings
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="flex justify-between text-sm font-semibold text-slate-700 mb-3">
                      <span>Monthly Ad Spend</span>
                      <span className="text-emerald-600">${adSpend.toLocaleString()}</span>
                    </label>
                    <input 
                      type="range" 
                      min="100" max="10000" step="100" 
                      value={adSpend} 
                      onChange={(e) => setAdSpend(Number(e.target.value))}
                      className="w-full accent-emerald-500 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-sm font-semibold text-slate-700 mb-3">
                      <span>Current Return on Ad Spend (ROAS)</span>
                      <span className="text-blue-600">{currentROAS.toFixed(1)}x</span>
                    </label>
                    <input 
                      type="range" 
                      min="1" max="5" step="0.1" 
                      value={currentROAS} 
                      onChange={(e) => setCurrentROAS(Number(e.target.value))}
                      className="w-full accent-blue-500 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="mt-10 rounded-2xl bg-slate-900 p-6 text-white shadow-inner">
                    <div className="text-sm font-medium text-slate-400">Estimated Additional Monthly Profit</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-4xl font-black text-emerald-400">+${additionalProfit.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                      <span className="text-sm text-slate-300">/ month</span>
                    </div>
                    
                    <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-medium text-slate-400 mb-1">Old ROAS</div>
                        <div className="font-bold text-slate-200">{currentROAS.toFixed(2)}x</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-400 mb-1">OmniRelay ROAS</div>
                        <div className="font-bold text-emerald-400">{optimizedROAS.toFixed(2)}x</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="border-t border-slate-100 bg-white p-6 flex justify-end">
              <button 
                onClick={() => setIsOpen(false)}
                className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 shadow-sm"
              >
                Close Calculator
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
