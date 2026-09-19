"use client";

export function PrintButton() {
  return <button className="rx-print-button" onClick={()=>window.print()}>Print / Save PDF</button>;
}
