"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, MessageCircle, Printer, QrCode, X } from "lucide-react";

type ShareMode = "whatsapp" | "web";

function themeFor(category: string) {
  const value = category.toLowerCase();
  if (/(restaurant|hospitality|cafe|hotel)/.test(value)) return { label: "Hospitality booking", start: "#8c2f14", end: "#df6b2d", accent: "#f5b166" };
  if (/(retail|store|shop|commerce)/.test(value)) return { label: "Retail appointment", start: "#36247c", end: "#8657d4", accent: "#d8c5ff" };
  if (/(opd|clinic|health|medical|doctor|dental)/.test(value)) return { label: "Clinic appointment", start: "#06233d", end: "#087b91", accent: "#66e0d1" };
  return { label: "Business booking", start: "#071426", end: "#155b88", accent: "#7edcff" };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

function fitName(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  let text = value.trim() || "Your business";
  while (context.measureText(text).width > maxWidth && text.length > 1) text = `${text.slice(0, -2).trimEnd()}…`;
  return text;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

async function loadImage(source: string) {
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Unable to load OmniRelay brand mark.")); image.src = source; });
  return image;
}

async function createFramedQr(url: string, businessName: string, category: string, mode: ShareMode) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the branded QR image.");

  const theme = themeFor(category);
  context.fillStyle = "#edf5f6";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const background = context.createLinearGradient(0, 0, canvas.width, 480);
  background.addColorStop(0, theme.start);
  background.addColorStop(1, theme.end);
  context.fillStyle = background;
  roundedRect(context, 48, 48, 1104, 520, 48);
  context.fill();

  context.fillStyle = theme.accent;
  context.font = "700 30px Arial, sans-serif";
  context.fillText(theme.label.toUpperCase(), 114, 152);
  context.fillStyle = "#ffffff";
  context.font = "700 68px Arial, sans-serif";
  context.fillText(fitName(context, businessName, 920), 114, 245);
  context.font = "400 32px Arial, sans-serif";
  context.fillStyle = "rgba(255,255,255,.82)";
  context.fillText(mode === "whatsapp" ? "Scan to start booking in WhatsApp" : "Scan to book online", 114, 310);
  context.font = "600 28px Arial, sans-serif";
  context.fillText("Powered securely by OmniRelay", 114, 430);

  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(7, 20, 38, .16)";
  context.shadowBlur = 44;
  context.shadowOffsetY = 20;
  roundedRect(context, 120, 480, 960, 900, 52);
  context.fill();
  context.shadowColor = "transparent";

  // High correction level plus a small white clear zone keeps the central brand mark scan-safe.
  const qr = await QRCode.toDataURL(url, { width: 760, margin: 2, errorCorrectionLevel: "H", color: { dark: "#071426", light: "#ffffff" } });
  const image = await loadImage(qr);
  context.drawImage(image, 220, 556, 760, 760);
  const brand = await loadImage("/omnirelay-app-icon.png");
  context.fillStyle = "#ffffff";
  context.beginPath(); context.arc(600, 936, 80, 0, Math.PI * 2); context.fill();
  context.save(); context.beginPath(); context.arc(600, 936, 66, 0, Math.PI * 2); context.clip();
  context.drawImage(brand, 534, 870, 132, 132); context.restore();
  context.strokeStyle = "#dce9eb"; context.lineWidth = 3; context.beginPath(); context.arc(600, 936, 67, 0, Math.PI * 2); context.stroke();
  context.fillStyle = "#17324d";
  context.font = "700 30px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText(mode === "whatsapp" ? "Open WhatsApp to book" : "Open the secure booking page", 600, 1360);
  context.textAlign = "start";
  return canvas.toDataURL("image/png");
}

export function BookingShare({ slug, whatsappNumber, businessName, businessCategory }: { slug: string; whatsappNumber: string; businessName: string; businessCategory: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ShareMode>("web");
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const digits = whatsappNumber.replace(/\D/g, "");
  const theme = themeFor(businessCategory);

  function buildUrl(nextMode: ShareMode) {
    return nextMode === "whatsapp" ? `https://wa.me/${digits}?text=${encodeURIComponent("BOOK APPOINTMENT")}` : `${window.location.origin}/book/${slug}`;
  }
  async function generate(nextMode: ShareMode) {
    const bookingUrl = buildUrl(nextMode);
    setMode(nextMode);
    setUrl(bookingUrl);
    setGenerating(true);
    setError("");
    try { setQr(await createFramedQr(bookingUrl, businessName, businessCategory, nextMode)); }
    catch (creationError) { setError(creationError instanceof Error ? creationError.message : "Unable to create the QR image."); }
    finally { setGenerating(false); }
  }
  function openShare() { setOpen(true); void generate(digits ? "whatsapp" : "web"); }
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  async function printPoster() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setError("Your browser blocked the print window. Please allow pop-ups and try again."); return; }
    const bookingUrl = buildUrl("web");
    setGenerating(true);
    setError("");
    printWindow.document.write("<title>Preparing printable booking QR…</title><p style='font:16px system-ui;padding:24px'>Preparing your printable booking QR…</p>");
    try {
      const poster = await createFramedQr(bookingUrl, businessName, businessCategory, "web");
      const safeBusinessName = escapeHtml(businessName);
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><title>${safeBusinessName} appointment QR</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#edf5f6;font-family:Arial,sans-serif;color:#071426}.poster{width:210mm;min-height:297mm;padding:12mm 10mm 9mm;display:flex;flex-direction:column;align-items:center;text-align:center;background:linear-gradient(180deg,#eef8f8 0,#fff 38%)}h1{margin:0 0 4mm;font-size:8mm;letter-spacing:-.4mm}p{max-width:165mm;margin:0 0 7mm;font-size:3.8mm;line-height:1.45;color:#435b6d}.poster img{display:block;width:178mm;height:auto}.note{margin-top:4mm;font-size:3.2mm;color:#607487}@media screen{body{padding:20px}.poster{margin:auto;box-shadow:0 8px 40px #07142622}}</style></head><body><main class="poster"><h1>Book an appointment</h1><p>Scan this QR code anytime to view live availability and request an appointment with ${safeBusinessName}.</p><img src="${poster}" alt="Booking QR code for ${safeBusinessName}"><div class="note">Live availability only · Secure booking powered by OmniRelay</div></main><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
      printWindow.document.close();
    } catch (printError) {
      printWindow.close();
      setError(printError instanceof Error ? printError.message : "Unable to create the printable QR.");
    } finally { setGenerating(false); }
  }
  const safeName = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "omnirelay";

  return <>
    <button className="secondary-calendar-button inline-flex items-center gap-2" onClick={openShare}><QrCode size={16} aria-hidden="true" />Share booking QR</button>
    {open ? <div className="share-backdrop" onClick={() => setOpen(false)}><section className="share-card qr-share-card" role="dialog" aria-modal="true" aria-labelledby="booking-qr-title" onClick={(event) => event.stopPropagation()}>
      <header><div><span className="app-eyebrow" style={{ color: theme.end }}>{theme.label}</span><h3 id="booking-qr-title">{businessName} booking QR</h3><p>A customised QR card for patients and local display.</p></div><button onClick={() => setOpen(false)} aria-label="Close QR sharing"><X size={18} /></button></header>
      <nav aria-label="Booking route"><button className={mode === "whatsapp" ? "primary-button" : "secondary-button"} disabled={!digits || generating} onClick={() => void generate("whatsapp")}><MessageCircle size={16} aria-hidden="true" />WhatsApp</button><button className={mode === "web" ? "primary-button" : "secondary-button"} disabled={generating} onClick={() => void generate("web")}>Web booking</button></nav>
      <div className="qr-preview-shell" aria-busy={generating}>{generating ? <span>Creating your branded QR…</span> : qr ? <img src={qr} alt={`Branded QR code for ${businessName} ${mode} booking`} /> : null}</div>
      <label>{mode === "whatsapp" ? "WhatsApp booking link" : "Web booking link"}<input readOnly value={url} /></label>
      <div className="qr-actions"><button className="secondary-button" onClick={() => void copy()} disabled={!url}><Copy size={16} aria-hidden="true" />{copied ? "Copied" : "Copy link"}</button>{qr ? <a className="primary-button" href={qr} download={`${safeName}-${mode}-booking-qr.png`}><Download size={16} aria-hidden="true" />Download QR</a> : null}</div>
      <div className="qr-poster-action"><button className="primary-button" onClick={() => void printPoster()} disabled={generating}><Printer size={16} aria-hidden="true" />Print A4 clinic poster</button><span>Uses the web booking QR, so patients can scan it at any time.</span></div>
      {error ? <p className="form-message" role="status">{error}</p> : <small>{mode === "whatsapp" ? "Use WhatsApp only after the acceptance gate is active. The web QR remains available for patients who cannot complete booking in WhatsApp." : "This card includes the business name and category treatment, while the QR itself always opens the verified booking link."}</small>}
    </section></div> : null}
  </>;
}
