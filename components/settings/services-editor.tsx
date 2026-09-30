"use client";

import { Service } from "@/app/app/settings/types";
import { Required } from "@/app/app/settings/utils";

interface ServicesEditorProps {
  services: Service[];
  setServices: (val: Service[]) => void;
  changeService: (index: number, patch: Partial<Service>) => void;
}

export function ServicesEditor({
  services, setServices, changeService
}: ServicesEditorProps) {
  return (
    <section className="foundation-section">
      <header>
        <div>
          <span className="app-eyebrow">SERVICES</span>
          <h2>What customers can book</h2>
        </div>
        <button type="button" className="secondary-button" onClick={() => setServices([...services, { name: "New service", service_type: "appointment", duration_minutes: 30, buffer_minutes: 0, price_paise: null, booking_enabled: true }])}>+ Add service</button>
      </header>
      <p className="required-note"><Required /> Add at least one bookable service to start accepting appointments.</p>
      <div className="editor-stack">
        {services.map((service, index) => (
          <article className="editor-card" key={service.id ?? index}>
            <div className="form-grid">
              <label>
                Service name<Required />
                <input value={service.name} onChange={(e) => changeService(index, { name: e.target.value })} required />
              </label>
              <label>
                Duration<Required />
                <select value={service.duration_minutes} onChange={(e) => changeService(index, { duration_minutes: Number(e.target.value) })} required>
                  {[15, 30, 45, 60, 90, 120].map((item) => <option key={item} value={item}>{item} minutes</option>)}
                </select>
              </label>
              <label>
                Price (₹)
                <input type="number" min="0" value={service.price_paise == null ? "" : service.price_paise / 100} onChange={(e) => changeService(index, { price_paise: e.target.value ? Number(e.target.value) * 100 : null })} />
              </label>
              <label>
                Buffer
                <select value={service.buffer_minutes ?? 0} onChange={(e) => changeService(index, { buffer_minutes: Number(e.target.value) })}>
                  {[0, 5, 10, 15, 30].map((item) => <option key={item} value={item}>{item} minutes</option>)}
                </select>
              </label>
              <label className="wide">
                Description
                <input value={service.description ?? ""} onChange={(e) => changeService(index, { description: e.target.value })} placeholder="What is included?" />
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
