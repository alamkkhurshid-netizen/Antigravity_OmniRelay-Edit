"use client";

import { categories } from "@/app/app/settings/types";
import { Required } from "@/app/app/settings/utils";

interface BusinessProfileEditorProps {
  name: string;
  setName: (val: string) => void;
  category: string;
  setCategory: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  website: string;
  setWebsite: (val: string) => void;
  businessPhoneError: boolean;
  websiteError: boolean;
}

export function BusinessProfileEditor({
  name, setName, category, setCategory, description, setDescription,
  phone, setPhone, email, setEmail, website, setWebsite,
  businessPhoneError, websiteError
}: BusinessProfileEditorProps) {
  return (
    <section className="foundation-section">
      <header>
        <div>
          <span className="app-eyebrow">BUSINESS PROFILE</span>
          <h2>Tell OmniRelay how your business operates</h2>
        </div>
        <span className="section-status">Required</span>
      </header>
      <p className="required-note"><Required /> Required to set up booking and customer communication.</p>
      <div className="form-grid">
        <label>
          Business name<Required />
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} aria-invalid={!name.trim()} />
        </label>
        <label>
          Category<Required />
          <select value={category} onChange={(e) => setCategory(e.target.value)} required>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="wide">
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What do you offer and who do you serve?" />
        </label>
        <label>
          Business phone<Required />
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98315 82626" required aria-invalid={Boolean(businessPhoneError)} />
          {businessPhoneError && <small className="field-error">Use 8–15 digits; you may include +, spaces, brackets or hyphens.</small>}
        </label>
        <label>
          Business email<Required />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="care@business.com" required aria-invalid={!email.trim()} />
        </label>
        <label className="wide">
          Website
          <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourbusiness.com" aria-invalid={Boolean(websiteError)} />
          {websiteError && <small className="field-error">Enter the full address, for example https://yourbusiness.com.</small>}
        </label>
      </div>
    </section>
  );
}
