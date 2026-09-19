"use client";

import { useEffect, useState } from "react";

const resultCache = new Map<string, { entries: CatalogueEntry[]; savedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export type MedicineCatalogueSelection = {
  id: number;
  sourceIdentifier: string;
  entryType: "brand" | "generic";
  displayName: string;
  genericName: string | null;
  supplierName: string | null;
  doseFormName: string | null;
  routeNames: string[];
};

type CatalogueEntry = {
  id: number;
  source_identifier: string;
  entry_type: "brand" | "generic";
  display_name: string;
  generic_name: string | null;
  supplier_name: string | null;
  dose_form_name: string | null;
  route_names: string[];
};

export function MedicineLookup({
  value,
  selection,
  onChange,
}: {
  value: string;
  selection: MedicineCatalogueSelection | null;
  onChange: (value: string, selection: MedicineCatalogueSelection | null) => void;
}) {
  const [entries, setEntries] = useState<CatalogueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selection || value.trim().length < 2) {
      const timer = window.setTimeout(() => setLoading(false), 0);
      return () => window.clearTimeout(timer);
    }

    const query = value.trim().replace(/\s+/g, " ").toLowerCase();
    const cached = resultCache.get(query);
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
      const timer = window.setTimeout(() => {
        setEntries(cached.entries);
        setOpen(true);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const response = await fetch(`/api/medicine-catalog?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      }).catch(() => null);
      if (response?.ok) {
        const result = (await response.json()) as { entries?: CatalogueEntry[] };
        const nextEntries = result.entries ?? [];
        resultCache.set(query, { entries: nextEntries, savedAt: Date.now() });
        if (resultCache.size > 60) {
          resultCache.delete(resultCache.keys().next().value as string);
        }
        setEntries(nextEntries);
        setOpen(true);
      }
      if (!controller.signal.aborted) setLoading(false);
    }, 120);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selection, value]);

  const select = (entry: CatalogueEntry) => {
    onChange(entry.display_name, {
      id: entry.id,
      sourceIdentifier: entry.source_identifier,
      entryType: entry.entry_type,
      displayName: entry.display_name,
      genericName: entry.generic_name,
      supplierName: entry.supplier_name,
      doseFormName: entry.dose_form_name,
      routeNames: entry.route_names,
    });
    setOpen(false);
  };

  return (
    <div className="medicine-lookup">
      <input
        aria-label="Medicine name"
        placeholder="Search brand or generic medicine"
        value={value}
        onChange={(event) => {
          setEntries([]);
          setOpen(false);
          onChange(event.target.value, null);
        }}
        onFocus={() => entries.length > 0 && setOpen(true)}
        autoComplete="off"
        required
      />
      {selection ? (
        <div className="medicine-selection">
          <span>{selection.entryType}</span>
          <small>
            {[selection.genericName, selection.supplierName, selection.doseFormName]
              .filter(Boolean)
              .join(" · ") || "Verified catalogue entry"}
          </small>
          <button type="button" onClick={() => onChange(value, null)}>
            Change
          </button>
        </div>
      ) : (
        value.trim().length >= 2 && (
          <small className="medicine-manual-state">
            {loading ? "Searching verified catalogue…" : "Choose a match, or keep this as manual entry."}
          </small>
        )
      )}
      {open && (
        <div className="medicine-results" role="listbox" aria-label="Verified medicine matches">
          {entries.length === 0 ? (
            <p>No verified match. Manual entry remains available.</p>
          ) : (
            entries.map((entry) => (
              <button type="button" key={entry.id} onClick={() => select(entry)}>
                <span className={`medicine-type ${entry.entry_type}`}>{entry.entry_type}</span>
                <b>{entry.display_name}</b>
                <small>
                  {[entry.generic_name, entry.supplier_name, entry.dose_form_name]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
