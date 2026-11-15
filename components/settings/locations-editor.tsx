"use client";

import { useState } from "react";
import { Trash2, Copy, Building2, Upload } from "lucide-react";
import { Location } from "@/app/app/settings/types";
import { Required, validPhone, validPostalCode } from "@/app/app/settings/utils";
import { DoctorRosterImportModal } from "@/components/doctor-roster-import-modal";

interface LocationsEditorProps {
  category: string;
  locations: Location[];
  setLocations: (val: Location[]) => void;
  changeLocation: (index: number, patch: Partial<Location>) => void;
  changeAddress: (index: number, patch: Partial<Location["address"]>) => void;
  deleteLocation?: (index: number) => Promise<void> | void;
}

export function LocationsEditor({
  category, locations, setLocations, changeLocation, changeAddress, deleteLocation
}: LocationsEditorProps) {
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  const handleDelete = async (index: number) => {
    const loc = locations[index];
    if (!loc) return;
    const itemLabel = category === "Healthcare" ? "chamber" : "location";
    const locName = loc.name || `${itemLabel} #${index + 1}`;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete "${locName}"? This will permanently remove this ${itemLabel} and its associated schedules.`
    );
    if (!confirmed) return;

    if (deleteLocation) {
      setDeletingIndex(index);
      try {
        await deleteLocation(index);
      } finally {
        setDeletingIndex(null);
      }
    } else {
      setLocations(locations.filter((_, i) => i !== index));
    }
  };

  const copyAddressFromPrimary = (index: number) => {
    const primary = locations[0];
    if (!primary) return;
    if (primary.phone) changeLocation(index, { phone: primary.phone });
    changeAddress(index, {
      line1: primary.address?.line1 || "",
      city: primary.address?.city || "",
      state: primary.address?.state || "",
      postal_code: primary.address?.postal_code || "",
    });
  };

  return (
    <section className="foundation-section">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="app-eyebrow">LOCATIONS</span>
          <h2>{category === "Healthcare" ? "Chambers, branches and service points" : "Branches and service points"}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {category === "Healthcare" && (
            <DoctorRosterImportModal
              triggerClassName="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100 transition-all cursor-pointer shadow-sm"
              triggerLabel="Bulk Upload Chambers & Roster (Excel / CSV)"
              onSuccess={() => window.location.reload()}
            />
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setLocations([...locations, {
              name: `${category === "Healthcare" ? "Chamber" : "Location"} ${locations.length + 1}`,
              location_type: category === "Healthcare" ? "chamber" : "branch",
              phone: locations[0]?.phone || "",
              timezone: "Asia/Kolkata",
              address: locations[0]?.address?.city ? { ...locations[0].address } : {}
            }])}
          >
            + Add {category === "Healthcare" ? "chamber" : "location"}
          </button>
        </div>
      </header>
      <p className="required-note"><Required /> Required for each location that accepts bookings.</p>
      <div className="editor-stack">
        {locations.map((location, index) => (
          <article className="editor-card" key={location.id ?? index}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Building2 style={{ width: "16px", height: "16px", color: "#0d9488" }} />
                <span style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                  {category === "Healthcare" ? `Chamber #${index + 1}` : `Location #${index + 1}`}
                  {location.name ? `: ${location.name}` : ""}
                </span>
                {location.id ? (
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#059669", backgroundColor: "#ecfdf5", border: "1px solid #a7f3d0", padding: "2px 8px", borderRadius: "9999px" }}>
                    Active
                  </span>
                ) : (
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#d97706", backgroundColor: "#fffbeb", border: "1px solid #fde68a", padding: "2px 8px", borderRadius: "9999px" }}>
                    Unsaved
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {index > 0 && locations[0]?.address?.city && (
                  <button
                    type="button"
                    onClick={() => copyAddressFromPrimary(index)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#0284c7",
                      backgroundColor: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      cursor: "pointer",
                    }}
                    title="Fill address from primary chamber"
                  >
                    <Copy style={{ width: "12px", height: "12px" }} />
                    Same address as Chamber 1
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDelete(index)}
                  disabled={deletingIndex === index}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#e11d48",
                    backgroundColor: "#fff1f2",
                    border: "1px solid #ffe4e6",
                    borderRadius: "8px",
                    padding: "5px 12px",
                    cursor: deletingIndex === index ? "wait" : "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title={`Delete ${location.name || "this location"}`}
                >
                  <Trash2 style={{ width: "13px", height: "13px" }} />
                  <span>{deletingIndex === index ? "Deleting…" : `Delete ${category === "Healthcare" ? "Chamber" : "Location"}`}</span>
                </button>
              </div>
            </div>

            <div className="form-grid">
              <label>
                Location name<Required />
                <input value={location.name} onChange={(e) => changeLocation(index, { name: e.target.value })} required minLength={2} aria-invalid={!location.name.trim()} />
              </label>
              <label>
                Type<Required />
                <select value={location.location_type} onChange={(e) => changeLocation(index, { location_type: e.target.value })} required>
                  {["chamber", "clinic", "branch", "restaurant", "virtual"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="wide">
                Address<Required />
                <input value={location.address?.line1 ?? ""} onChange={(e) => changeAddress(index, { line1: e.target.value })} placeholder="Street, building, landmark" required />
              </label>
              <label>
                City<Required />
                <input value={location.address?.city ?? ""} onChange={(e) => changeAddress(index, { city: e.target.value })} required />
              </label>
              <label>
                State<Required />
                <input value={location.address?.state ?? ""} onChange={(e) => changeAddress(index, { state: e.target.value })} required />
              </label>
              <label>
                Postal code<Required />
                <input inputMode="numeric" maxLength={6} value={location.address?.postal_code ?? ""} onChange={(e) => changeAddress(index, { postal_code: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="700066" required aria-invalid={Boolean(!location.address?.postal_code || !validPostalCode(location.address.postal_code))} />
                {location.address?.postal_code && !validPostalCode(location.address.postal_code) && <small className="field-error">Enter a 6-digit postal code.</small>}
              </label>
              <label>
                Location phone<Required />
                <input type="tel" inputMode="tel" value={location.phone ?? ""} onChange={(e) => changeLocation(index, { phone: e.target.value })} placeholder="+91 98315 82626" required aria-invalid={Boolean(!location.phone || !validPhone(location.phone))} />
                {location.phone && !validPhone(location.phone) && <small className="field-error">Enter an 8–15 digit phone number.</small>}
              </label>
              <label className="wide">
                Google Maps share link
                <input type="url" value={location.google_maps_url ?? ""} onChange={(e) => changeLocation(index, { google_maps_url: e.target.value })} placeholder="https://share.google/..." />
                <small className="field-help">Shown in WhatsApp clinic timings and the public directory as a tappable map link.</small>
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
