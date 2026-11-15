"use client";

import React, { useState } from "react";
import {
  X,
  Clock,
  Calendar,
  MapPin,
  Plus,
  Trash2,
  User,
  Stethoscope,
  Award,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { RegisteredConsultant, ClinicLocation } from "@/app/app/clinic-operations/types";

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const SLOT_OPTIONS = [10, 15, 20, 30, 40, 45, 60];

interface EditDoctorModalProps {
  doctor: RegisteredConsultant | null;
  locations: ClinicLocation[];
  onClose: () => void;
  onSave: (doctorId: string, updatedData: any) => Promise<any>;
}

export function EditDoctorModal({
  doctor,
  locations,
  onClose,
  onSave,
}: EditDoctorModalProps) {
  if (!doctor) return null;

  // Form State
  const [name, setName] = useState(doctor.name);
  const [specialization, setSpecialization] = useState(doctor.specialization || "");
  const [qualifications, setQualifications] = useState(doctor.qualifications || "");
  const [registrationNumber, setRegistrationNumber] = useState(doctor.registrationNumber || "");
  const [experienceYears, setExperienceYears] = useState<string>(
    doctor.experienceYears !== null && doctor.experienceYears !== undefined
      ? String(doctor.experienceYears)
      : ""
  );
  const [phone, setPhone] = useState(doctor.phone || "");
  const [email, setEmail] = useState(doctor.email || "");
  const [languages, setLanguages] = useState((doctor.languages || []).join(", "));
  const [biography, setBiography] = useState(doctor.biography || "");

  // Shifts State
  const [shifts, setShifts] = useState(
    (doctor.shifts || []).map((s) => ({
      id: s.id,
      weekday: s.weekday,
      start_time: s.startTime,
      end_time: s.endTime,
      location_id: s.locationId || locations.find((l) => l.name === s.chamber)?.id || locations[0]?.id || "",
      chamber: s.chamber,
      slot_interval_minutes: s.slotMinutes || 20,
    }))
  );

  const [activeTab, setActiveTab] = useState<"shifts" | "profile">("shifts");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleAddShift = () => {
    // Default to next logical day or Monday
    const usedDays = new Set(shifts.map((s) => s.weekday));
    const nextDay = [1, 2, 3, 4, 5, 6, 0].find((d) => !usedDays.has(d)) ?? 1;

    setShifts([
      ...shifts,
      {
        id: `temp-${Date.now()}`,
        weekday: nextDay,
        start_time: "09:00",
        end_time: "13:00",
        location_id: locations[0]?.id || "",
        chamber: locations[0]?.name || "Chamber 1",
        slot_interval_minutes: 20,
      },
    ]);
  };

  const handleRemoveShift = (index: number) => {
    setShifts(shifts.filter((_, idx) => idx !== index));
  };

  const handleUpdateShift = (index: number, patch: Partial<(typeof shifts)[0]>) => {
    setShifts(
      shifts.map((s, idx) => {
        if (idx !== index) return s;
        const updated = { ...s, ...patch };
        if (patch.location_id) {
          const loc = locations.find((l) => l.id === patch.location_id);
          if (loc) updated.chamber = loc.name;
        }
        return updated;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Doctor name is required.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload = {
        id: doctor.id,
        name: name.trim(),
        specialization: specialization.trim(),
        qualifications: qualifications.trim(),
        registration_number: registrationNumber.trim(),
        experience_years: experienceYears ? parseInt(experienceYears, 10) : null,
        languages: languages.split(/[,;/]+/).map((l) => l.trim()).filter(Boolean),
        biography: biography.trim(),
        contact_phone: phone.trim(),
        contact_email: email.trim(),
        shifts: shifts.map((s) => ({
          weekday: s.weekday,
          start_time: s.start_time,
          end_time: s.end_time,
          location_id: s.location_id,
          chamber: s.chamber,
          slot_interval_minutes: s.slot_interval_minutes,
        })),
      };

      await onSave(doctor.id, payload);
      setSuccessMsg("Doctor details & timing updated successfully!");
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update doctor details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-teal-50 to-blue-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {doctor.name.replace(/^dr\.\s*/i, "").charAt(0) || "D"}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Edit {doctor.name}
              </h3>
              <p className="text-xs text-slate-500">
                Update weekly OPD shift timings, chamber room, and clinician credentials
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 bg-slate-50/60 px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("shifts")}
            className={`flex items-center gap-2 py-2.5 px-4 font-semibold text-xs border-b-2 transition-all ${
              activeTab === "shifts"
                ? "border-teal-600 text-teal-700 bg-white rounded-t-lg shadow-sm"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Shift Timings & Chambers ({shifts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2 py-2.5 px-4 font-semibold text-xs border-b-2 transition-all ${
              activeTab === "profile"
                ? "border-teal-600 text-teal-700 bg-white rounded-t-lg shadow-sm"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <User className="w-4 h-4" />
            <span>Doctor Profile & Credentials</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === "shifts" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Weekly Consultation Shifts
                  </h4>
                  <p className="text-xs text-slate-500">
                    Add or modify recurring days, OPD chamber, and hours for patient bookings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddShift}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 text-xs font-bold border border-teal-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Shift</span>
                </button>
              </div>

              {shifts.length === 0 ? (
                <div className="text-center py-8 rounded-xl border border-dashed border-slate-200 bg-slate-50">
                  <p className="text-xs text-slate-500 font-medium">No shifts configured for this doctor.</p>
                  <button
                    type="button"
                    onClick={handleAddShift}
                    className="mt-2 text-xs font-bold text-teal-600 hover:underline"
                  >
                    + Click here to add a shift
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {shifts.map((shift, idx) => (
                    <div
                      key={shift.id || idx}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center gap-3"
                    >
                      {/* Day Selector */}
                      <div className="w-full md:w-36">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Day
                        </label>
                        <select
                          value={shift.weekday}
                          onChange={(e) =>
                            handleUpdateShift(idx, { weekday: parseInt(e.target.value, 10) })
                          }
                          className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        >
                          {DAY_OPTIONS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Start - End Time */}
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={shift.start_time}
                            onChange={(e) =>
                              handleUpdateShift(idx, { start_time: e.target.value })
                            }
                            required
                            className="w-full text-xs font-mono font-medium rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                        <span className="text-slate-400 mt-4">–</span>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            End Time
                          </label>
                          <input
                            type="time"
                            value={shift.end_time}
                            onChange={(e) =>
                              handleUpdateShift(idx, { end_time: e.target.value })
                            }
                            required
                            className="w-full text-xs font-mono font-medium rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </div>
                      </div>

                      {/* Chamber Location */}
                      <div className="w-full md:w-36">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Chamber Room
                        </label>
                        <select
                          value={shift.location_id}
                          onChange={(e) =>
                            handleUpdateShift(idx, { location_id: e.target.value })
                          }
                          className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        >
                          {locations.length > 0 ? (
                            locations.map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name}
                              </option>
                            ))
                          ) : (
                            <option value="">{shift.chamber || "Chamber 1"}</option>
                          )}
                        </select>
                      </div>

                      {/* Slot Interval */}
                      <div className="w-full md:w-24">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Slot
                        </label>
                        <select
                          value={shift.slot_interval_minutes}
                          onChange={(e) =>
                            handleUpdateShift(idx, {
                              slot_interval_minutes: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        >
                          {SLOT_OPTIONS.map((min) => (
                            <option key={min} value={min}>
                              {min} mins
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Delete Action */}
                      <div className="mt-3 md:mt-4">
                        <button
                          type="button"
                          onClick={() => handleRemoveShift(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Remove shift"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Doctor Full Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Dr Alok Kumar Ray"
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Specialization
                  </label>
                  <input
                    type="text"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    placeholder="e.g. ENT, Cardiology"
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Qualifications
                  </label>
                  <input
                    type="text"
                    value={qualifications}
                    onChange={(e) => setQualifications(e.target.value)}
                    placeholder="e.g. MBBS, MS (ENT)"
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Medical Council Registration No
                  </label>
                  <input
                    type="text"
                    value={registrationNumber}
                    onChange={(e) => setRegistrationNumber(e.target.value)}
                    placeholder="e.g. WBMC-58910"
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Years of Experience
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="70"
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    placeholder="e.g. 17"
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    WhatsApp / Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+918910860959"
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@clinic.com"
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Spoken Languages
                </label>
                <input
                  type="text"
                  value={languages}
                  onChange={(e) => setLanguages(e.target.value)}
                  placeholder="English, Bengali, Hindi"
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Public Profile Summary
                </label>
                <textarea
                  rows={3}
                  value={biography}
                  onChange={(e) => setBiography(e.target.value)}
                  placeholder="Short patient-facing introduction displayed on WhatsApp and booking portals."
                  className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Changes…</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
