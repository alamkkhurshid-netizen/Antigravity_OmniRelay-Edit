/**
 * OmniRelay GST Invoice Generator
 * Standardized Tax Invoice generation compliant with GST Rules, India (SAC Code 9984).
 */

export interface InvoiceSupplierInfo {
  legalName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  gstin: string;
  pan: string;
  email: string;
  website: string;
}

export interface InvoiceCustomerInfo {
  organizationId: string;
  organizationName: string;
  billingAddress?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  gstin?: string; // Optional: If customer is GST-registered
}

export interface InvoiceItem {
  slNo: number;
  description: string;
  sacCode: string; // e.g. "998413" - Other telecommunications and information services
  taxableValueInr: number;
  cgstRatePct: number;
  cgstAmountInr: number;
  sgstRatePct: number;
  sgstAmountInr: number;
  igstRatePct: number;
  igstAmountInr: number;
  totalInr: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string; // ISO or YYYY-MM-DD
  paymentReference: string; // Razorpay Payment ID
  orderReference?: string; // Razorpay Order ID
  supplier: InvoiceSupplierInfo;
  customer: InvoiceCustomerInfo;
  items: InvoiceItem[];
  subtotalInr: number;
  totalGstInr: number;
  grandTotalInr: number;
  totalInWords: string;
  isInterState: boolean;
  reverseChargeApplicable: boolean;
}

export const OMNIRELAY_SUPPLIER_DEFAULT: InvoiceSupplierInfo = {
  legalName: "OmniRelay Technologies Private Limited",
  tradeName: "OmniRelay",
  address: "Innov8 Hub, Building 4A, Tech Park Corridor",
  city: "Bengaluru",
  state: "Karnataka",
  stateCode: "29",
  pincode: "560103",
  gstin: "29AABCO9999P1Z5",
  pan: "AABCO9999P",
  email: "billing@omnirelay.io",
  website: "https://omnirelay.io",
};

/**
 * Converts a numeric INR value to words in Indian Numbering System.
 */
export function numberToIndianWords(amount: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function numToWords(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n] + " ";
    if (n < 100) return tens[Math.floor(n / 10)] + " " + ones[n % 10] + " ";
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred " + numToWords(n % 100);
    if (n < 100000) return numToWords(Math.floor(n / 1000)) + "Thousand " + numToWords(n % 1000);
    if (n < 10000000) return numToWords(Math.floor(n / 100000)) + "Lakh " + numToWords(n % 100000);
    return numToWords(Math.floor(n / 10000000)) + "Crore " + numToWords(n % 10000000);
  }

  const wholeNumber = Math.floor(amount);
  const fraction = Math.round((amount - wholeNumber) * 100);

  const wholeWords = wholeNumber === 0 ? "Zero" : numToWords(wholeNumber).trim();
  const fractionWords = fraction > 0 ? ` and ${numToWords(fraction).trim()} Paise` : "";

  return `Indian Rupees ${wholeWords}${fractionWords} Only`;
}

/**
 * Builds structured InvoiceData from a wallet transaction or checkout payload.
 */
export function buildGstInvoiceData(params: {
  invoiceNumber?: string;
  organizationId: string;
  organizationName: string;
  amountPaise: number;
  gstAmountPaise?: number;
  razorpayPaymentId: string;
  razorpayOrderId?: string;
  customerStateCode?: string;
  customerGstin?: string;
  customerAddress?: string;
  issuedAt?: string;
}): InvoiceData {
  const baseInr = params.amountPaise / 100;
  const gstInr = (params.gstAmountPaise ?? Math.round(params.amountPaise * 0.18)) / 100;
  const grandTotalInr = baseInr + gstInr;

  const supplier = OMNIRELAY_SUPPLIER_DEFAULT;
  const isInterState = Boolean(params.customerStateCode && params.customerStateCode !== supplier.stateCode);

  const cgstRate = isInterState ? 0 : 9;
  const sgstRate = isInterState ? 0 : 9;
  const igstRate = isInterState ? 18 : 0;

  const cgstAmount = isInterState ? 0 : Math.round((baseInr * 0.09) * 100) / 100;
  const sgstAmount = isInterState ? 0 : Math.round((baseInr * 0.09) * 100) / 100;
  const igstAmount = isInterState ? Math.round((baseInr * 0.18) * 100) / 100 : 0;

  const invoiceNumber = params.invoiceNumber || `INV-${new Date().getFullYear()}-${params.razorpayPaymentId.slice(-8).toUpperCase()}`;

  const items: InvoiceItem[] = [
    {
      slNo: 1,
      description: "Prepaid Operational Credits — WhatsApp Cloud API & Voice AI Dispatch",
      sacCode: "998413",
      taxableValueInr: baseInr,
      cgstRatePct: cgstRate,
      cgstAmountInr: cgstAmount,
      sgstRatePct: sgstRate,
      sgstAmountInr: sgstAmount,
      igstRatePct: igstRate,
      igstAmountInr: igstAmount,
      totalInr: grandTotalInr,
    },
  ];

  return {
    invoiceNumber,
    invoiceDate: params.issuedAt || new Date().toISOString().split("T")[0],
    paymentReference: params.razorpayPaymentId,
    orderReference: params.razorpayOrderId,
    supplier,
    customer: {
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      billingAddress: params.customerAddress || "Registered Healthcare Facility",
      stateCode: params.customerStateCode || "29",
      gstin: params.customerGstin || "Unregistered / B2C",
    },
    items,
    subtotalInr: baseInr,
    totalGstInr: gstInr,
    grandTotalInr,
    totalInWords: numberToIndianWords(grandTotalInr),
    isInterState,
    reverseChargeApplicable: false,
  };
}

/**
 * Renders an accessible, print-optimized HTML Tax Invoice.
 */
export function renderInvoiceHtml(inv: InvoiceData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tax Invoice — ${inv.invoiceNumber}</title>
  <style>
    @media print {
      body { margin: 0; padding: 15mm; background: #fff; }
      .no-print { display: none !important; }
      .invoice-box { box-shadow: none !important; border: none !important; }
    }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #f8fafc; margin: 0; padding: 30px 15px; }
    .invoice-box { max-width: 850px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 36px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #0f172a; margin-bottom: 24px; }
    .brand { font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
    .brand span { color: #0d9488; }
    .invoice-badge { text-align: right; }
    .invoice-badge h1 { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; }
    .invoice-badge p { margin: 4px 0 0; font-size: 13px; color: #64748b; font-weight: 600; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 30px; font-size: 13px; line-height: 1.5; }
    .meta-col h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; }
    .meta-col p { margin: 0 0 4px; }
    .meta-col b { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; }
    td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary-box { width: 320px; margin-left: auto; margin-bottom: 30px; font-size: 13px; }
    .summary-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
    .summary-row.total { font-weight: 800; font-size: 16px; border-bottom: 2px solid #0f172a; border-top: 2px solid #0f172a; color: #0f172a; margin-top: 8px; padding: 10px 0; }
    .words-box { background: #f8fafc; border-left: 4px solid #0d9488; padding: 12px 16px; font-size: 12px; font-style: italic; color: #475569; margin-bottom: 30px; border-radius: 0 8px 8px 0; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #64748b; }
    .btn-bar { max-width: 850px; margin: 0 auto 20px; display: flex; justify-content: flex-end; gap: 10px; }
    .btn { background: #0f172a; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .btn:hover { background: #1e293b; }
  </style>
</head>
<body>
  <div class="btn-bar no-print">
    <button onclick="window.print()" class="btn">Print / Save as PDF</button>
  </div>

  <div class="invoice-box">
    <div class="header-row">
      <div>
        <div class="brand">Omni<span>Relay</span></div>
        <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">${inv.supplier.legalName}</p>
      </div>
      <div class="invoice-badge">
        <h1>GST Tax Invoice</h1>
        <p><b>#${inv.invoiceNumber}</b></p>
        <p>Date: ${inv.invoiceDate}</p>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-col">
        <h3>Supplier (Billed From)</h3>
        <p><b>${inv.supplier.tradeName}</b> (${inv.supplier.legalName})</p>
        <p>${inv.supplier.address}, ${inv.supplier.city}, ${inv.supplier.state} - ${inv.supplier.pincode}</p>
        <p>GSTIN: <b>${inv.supplier.gstin}</b> | PAN: ${inv.supplier.pan}</p>
        <p>State Code: <b>${inv.supplier.stateCode}</b> (${inv.supplier.state})</p>
      </div>

      <div class="meta-col">
        <h3>Recipient (Billed To)</h3>
        <p><b>${inv.customer.organizationName}</b></p>
        <p>${inv.customer.billingAddress || "Clinic Facility"}</p>
        <p>GSTIN: <b>${inv.customer.gstin || "Unregistered / B2C"}</b></p>
        <p>Payment Ref: <code style="font-size: 11px;">${inv.paymentReference}</code></p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="text-center" style="width: 40px;">#</th>
          <th>Description of Service</th>
          <th class="text-center" style="width: 90px;">SAC Code</th>
          <th class="text-right" style="width: 110px;">Taxable Value</th>
          <th class="text-right" style="width: 110px;">GST (18%)</th>
          <th class="text-right" style="width: 120px;">Total (INR)</th>
        </tr>
      </thead>
      <tbody>
        ${inv.items
          .map(
            (item) => `<tr>
          <td class="text-center">${item.slNo}</td>
          <td><b>${item.description}</b></td>
          <td class="text-center"><code>${item.sacCode}</code></td>
          <td class="text-right">₹${item.taxableValueInr.toFixed(2)}</td>
          <td class="text-right">₹${(item.cgstAmountInr + item.sgstAmountInr + item.igstAmountInr).toFixed(2)}</td>
          <td class="text-right"><b>₹${item.totalInr.toFixed(2)}</b></td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>

    <div class="summary-box">
      <div class="summary-row">
        <span>Taxable Amount</span>
        <span>₹${inv.subtotalInr.toFixed(2)}</span>
      </div>
      ${
        inv.isInterState
          ? `<div class="summary-row">
        <span>IGST @ 18%</span>
        <span>₹${inv.totalGstInr.toFixed(2)}</span>
      </div>`
          : `<div class="summary-row">
        <span>CGST @ 9%</span>
        <span>₹${(inv.totalGstInr / 2).toFixed(2)}</span>
      </div>
      <div class="summary-row">
        <span>SGST @ 9%</span>
        <span>₹${(inv.totalGstInr / 2).toFixed(2)}</span>
      </div>`
      }
      <div class="summary-row total">
        <span>Grand Total</span>
        <span>₹${inv.grandTotalInr.toFixed(2)}</span>
      </div>
    </div>

    <div class="words-box">
      <b>Amount in Words:</b> ${inv.totalInWords}
    </div>

    <div class="footer">
      <div>
        <p style="margin: 0 0 4px;"><b>Reverse Charge:</b> ${inv.reverseChargeApplicable ? "Yes" : "No"}</p>
        <p style="margin: 0;">This is a computer-generated tax invoice. No physical signature is required.</p>
      </div>
      <div style="text-align: right;">
        <p style="margin: 0 0 4px;">For <b>${inv.supplier.legalName}</b></p>
        <p style="margin: 20px 0 0; font-weight: bold; color: #0f172a;">Authorized Signatory</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
