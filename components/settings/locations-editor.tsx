"use client";

import { Location } from "@/app/app/settings/types";
import { Required, validPhone, validPostalCode } from "@/app/app/settings/utils";

interface LocationsEditorProps {
  category: string;
  locations: Location[];
  setLocations: (val: Location[]) => void;
  changeLocation: (index: number, patch: Partial<Location>) => void;
  changeAddress: (index: number, patch: Partial<Location["address"]>) => void;
}

export function LocationsEditor({
  category, locations, setLocations, changeLocation, changeAddress
}: LocationsEditorProps) {
  return (
    <section className="foundation-section">
      <header>
        <div>
          <span className="app-eyebrow">LOCATIONS</span>
          <h2>{category === "Healthcare" ? "Chambers, branches and service points" : "Branches and service points"}</h2>
        </div>
        <button type="button" className="secondary-button" onClick={() => setLocations([...locations, { name: `Location ${locations.length + 1}`, location_type: category === "Healthcare" ? "chamber" : "branch", phone: "", timezone: "Asia/Kolkata", address: {} }])}>+ Add location</button>
      </header>
      <p className="required-note"><Required /> Required for each location that accepts bookings.</p>
      <div className="editor-stack">
        {locations.map((location, index) => (
          <article className="editor-card" key={location.id ?? index}>
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
