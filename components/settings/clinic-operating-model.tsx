"use client";

import { Trash2 } from "lucide-react";
import { Department } from "@/app/app/settings/types";
import { DoctorRosterImportModal } from "@/components/doctor-roster-import-modal";

interface ClinicOperatingModelProps {
  category: string;
  clinicMode: string;
  setClinicMode: (val: string) => void;
  departments: Department[];
  setDepartments: (val: Department[]) => void;
  deleteDepartment?: (index: number) => Promise<void> | void;
}

export function ClinicOperatingModel({
  category, clinicMode, setClinicMode, departments, setDepartments, deleteDepartment
}: ClinicOperatingModelProps) {
  if (category !== "Healthcare") return null;

  const handleDeleteDepartment = async (index: number) => {
    const dep = departments[index];
    if (!dep) return;
    const name = dep.name || `Department #${index + 1}`;
    if (!window.confirm(`Are you sure you want to delete department "${name}"?`)) return;

    if (deleteDepartment) {
      await deleteDepartment(index);
    } else {
      setDepartments(departments.filter((_, i) => i !== index));
    }
  };

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
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <b>Departments and specialties</b>
              <span>Patients choose a department before seeing eligible doctors.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <DoctorRosterImportModal
                triggerClassName="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-50 px-3.5 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-100 transition-all cursor-pointer shadow-sm"
                triggerLabel="Upload Doctor & Clinic Data (Excel / CSV)"
                onSuccess={() => window.location.reload()}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDepartments([...departments, { id: crypto.randomUUID(), name: `Department ${departments.length + 1}`, code: null, description: null, active: true, sort_order: departments.length }])}
              >
                + Add department
              </button>
            </div>
          </header>
          {departments.map((item, index) => (
            <article className="editor-card" key={item.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", paddingBottom: "8px", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                  Department #{index + 1}: {item.name || "Untitled"}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteDepartment(index)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#e11d48",
                    backgroundColor: "#fff1f2",
                    border: "1px solid #ffe4e6",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                  title={`Delete department ${item.name}`}
                >
                  <Trash2 style={{ width: "13px", height: "13px" }} />
                  Delete department
                </button>
              </div>

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
