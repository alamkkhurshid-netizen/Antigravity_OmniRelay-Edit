"use client";

import { ImportRow, Preview } from "@/app/app/clinic-operations/types";
import { parseCsv } from "@/app/app/clinic-operations/use-clinic-operations";

interface DoctorImportPanelProps {
  rows: ImportRow[];
  setRows: (val: ImportRow[]) => void;
  preview: Preview | null;
  setPreview: (val: Preview | null) => void;
  message: string;
  setMessage: (val: string) => void;
  busy: boolean;
  validate: (commit?: boolean) => void;
  download: () => void;
}

export function DoctorImportPanel({
  rows, setRows, preview, setPreview, message, setMessage, busy, validate, download
}: DoctorImportPanelProps) {
  return (
    <section className="doctor-import">
      <header>
        <div>
          <span className="app-eyebrow">BULK ONBOARDING</span>
          <h3>Import doctors and recurring schedules</h3>
          <p>Preview every row before one atomic commit. Existing doctor profiles are never overwritten.</p>
        </div>
        <button type="button" className="secondary-button" onClick={download}>
          Download CSV template
        </button>
      </header>
      <label className="import-drop">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const parsed = parseCsv(await file.text());
              setRows(parsed);
              setPreview(null);
              setMessage(`${parsed.length} rows loaded. Run validation before import.`);
            } catch (error) {
              setRows([]);
              setPreview(null);
              setMessage(error instanceof Error ? error.message : "CSV could not be read.");
            }
          }}
        />
        <b>Choose doctor roster CSV</b>
        <span>Maximum 200 rows · no patient data</span>
      </label>
      {rows.length > 0 && (
        <div className="import-actions">
          <span>{rows.length} rows ready</span>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => validate(false)}>
            {busy ? "Checking…" : "Validate & preview"}
          </button>
          {preview?.valid && (
            <button type="button" className="primary-button" disabled={busy} onClick={() => validate(true)}>
              Import all doctors
            </button>
          )}
        </div>
      )}
      {preview && (
        <div className={preview.valid ? "import-result valid" : "import-result invalid"}>
          <b>{preview.valid ? "All rows passed validation" : "Import blocked"}</b>
          <span>
            {preview.valid
              ? `${preview.row_count} doctors are ready for atomic import.`
              : `Fix ${preview.errors.length} validation issue${preview.errors.length === 1 ? "" : "s"}. No changes were made.`}
          </span>
          {preview.errors.length > 0 && (
            <ul>
              {preview.errors.slice(0, 20).map((error, index) => (
                <li key={`${error.row}-${error.field}-${index}`}>
                  <strong>Row {error.row} · {error.field}</strong>
                  {error.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
