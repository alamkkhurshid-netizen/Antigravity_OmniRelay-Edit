"use client";

import { Department } from "@/app/app/settings/types";

interface ClinicOperatingModelProps {
  category: string;
  clinicMode: string;
  setClinicMode: (val: string) => void;
  departments: Department[];
  setDepartments: (val: Department[]) => void;
}

export function ClinicOperatingModel({
  category, clinicMode, setClinicMode, departments, setDepartments
}: ClinicOperatingModelProps) {
  if (category !== "Healthcare") return null;

  return (
    <section className="foundation-section">
      <header>
        <div>
          <span className="app-eyebrow">CLINIC OPERATING MODEL</span>
          <h2>Solo or multi-doctor booking</h2>
        </div>
        <span className="section-status">Workflow routing</span>
      </header>
      <div className="form-grid">
        <label>
          Clinic type
          <select value={clinicMode} onChange={(e) => setClinicMode(e.target.value)}>
            <option value="solo_practitioner">Solo practitioner</option>
            <option value="multi_doctor_clinic">Multi-doctor clinic / polyclinic</option>
            <option value="diagnostic_centre">Diagnostic centre</option>
          </select>
          <small className="field-help">Solo mode bypasses department and doctor selection. Multi-doctor mode enables department-based routing.</small>
        </label>
      </div>
      {clinicMode === "multi_doctor_clinic" && (
        <div className="editor-stack">
          <header>
            <div>
              <b>Departments and specialties</b>
              <span>Patients choose a department before seeing eligible doctors.</span>
            </div>
            <button type="button" className="secondary-button" onClick={() => setDepartments([...departments, { id: crypto.randomUUID(), name: `Department ${departments.length + 1}`, code: null, description: null, active: true, sort_order: departments.length }])}>+ Add department</button>
          </header>
          {departments.map((item, index) => (
            <article className="editor-card" key={item.id}>
              <div className="form-grid">
                <label>
                  Department name
                  <input value={item.name} onChange={(e) => setDepartments(departments.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} placeholder="Cardiology" required />
                </label>
                <label>
                  Short code
                  <input value={item.code ?? ""} onChange={(e) => setDepartments(departments.map((row, i) => i === index ? { ...row, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") || null } : row))} placeholder="cardiology" />
                </label>
                <label className="wide">
                  Description
                  <input value={item.description ?? ""} onChange={(e) => setDepartments(departments.map((row, i) => i === index ? { ...row, description: e.target.value || null } : row))} placeholder="Optional patient-facing description" />
                </label>
                <label>
                  <input type="checkbox" checked={item.active} onChange={(e) => setDepartments(departments.map((row, i) => i === index ? { ...row, active: e.target.checked } : row))} /> Active for booking
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
