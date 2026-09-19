#!/usr/bin/env bash
set -euo pipefail

# Creates one encrypted OmniRelay logical backup on a trusted operator machine.
# Required environment variables:
#   OMNIRELAY_DATABASE_URL          Supabase session-pooler connection string
#   OMNIRELAY_BACKUP_AGE_RECIPIENT  age public recipient (never a private key)
#   OMNIRELAY_BACKUP_DIR            absolute off-repository destination

umask 077

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $1" >&2
    exit 1
  }
}

require_value() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required environment variable is missing: $name" >&2
    exit 1
  fi
}

require_command supabase
require_command age
require_command tar
require_command sha256sum
require_value OMNIRELAY_DATABASE_URL
require_value OMNIRELAY_BACKUP_AGE_RECIPIENT
require_value OMNIRELAY_BACKUP_DIR

# Optional: the original Common Drug Codes flat-file package used by the
# importer. It is kept inside the encrypted archive so the medicine catalogue
# can be rebuilt without sending its large COPY stream through the pooler.
catalog_source_package="${OMNIRELAY_MEDICINE_CATALOG_SOURCE_PACKAGE:-}"

case "$OMNIRELAY_BACKUP_DIR" in
  /*) ;;
  *) echo "OMNIRELAY_BACKUP_DIR must be an absolute path." >&2; exit 1 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$OMNIRELAY_BACKUP_DIR/" in
  "$repo_root"/*)
    echo "Backup destination must be outside the application repository." >&2
    exit 1
    ;;
esac

mkdir -p "$OMNIRELAY_BACKUP_DIR"
work_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT INT TERM

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="omnirelay-${stamp}"
archive="$work_dir/${base}.tar"
encrypted="$OMNIRELAY_BACKUP_DIR/${base}.backup.age"
checksum="$OMNIRELAY_BACKUP_DIR/${base}.backup.sha256"
catalog_source_in_archive=""

if [[ -n "$catalog_source_package" ]]; then
  [[ -f "$catalog_source_package" ]] || { echo "Medicine catalogue source package was not found: $catalog_source_package" >&2; exit 1; }
  catalog_source_in_archive="medicine-catalog-source.${catalog_source_package##*.}"
fi

supabase db dump --db-url "$OMNIRELAY_DATABASE_URL" \
  -f "$work_dir/roles.sql" --role-only
supabase db dump --db-url "$OMNIRELAY_DATABASE_URL" \
  -f "$work_dir/schema.sql"
supabase db dump --db-url "$OMNIRELAY_DATABASE_URL" \
  -f "$work_dir/data.sql" --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes" \
  -x "public.medicine_catalog_entries"

if [[ -n "$catalog_source_in_archive" ]]; then
  cp "$catalog_source_package" "$work_dir/$catalog_source_in_archive"
fi

manifest_contents="roles.sql,schema.sql,data.sql"
catalog_recovery_source="not_included"
if [[ -n "$catalog_source_in_archive" ]]; then
  manifest_contents+=",$catalog_source_in_archive"
  catalog_recovery_source="included:$catalog_source_in_archive"
fi

cat >"$work_dir/MANIFEST.txt" <<EOF
backup_created_utc=$stamp
contents=$manifest_contents
storage_binary_objects_included=false
medicine_catalog_entries_in_data_sql=false
medicine_catalog_rebuild_source=$catalog_recovery_source
restore_note=circular foreign-key data requires an isolated restore procedure that handles constraints before validation
restore_target=isolated_non_production_first
EOF

archive_inputs=(roles.sql schema.sql data.sql MANIFEST.txt)
if [[ -n "$catalog_source_in_archive" ]]; then archive_inputs+=("$catalog_source_in_archive"); fi
tar -C "$work_dir" -cf "$archive" "${archive_inputs[@]}"
age -r "$OMNIRELAY_BACKUP_AGE_RECIPIENT" -o "$encrypted" "$archive"

(
  cd "$OMNIRELAY_BACKUP_DIR"
  sha256sum "$(basename "$encrypted")" >"$(basename "$checksum")"
)

echo "Encrypted backup created: $encrypted"
echo "Checksum created: $checksum"
echo "Storage binary objects require a separate encrypted backup."
if [[ -z "$catalog_source_in_archive" ]]; then
  echo "WARNING: medicine_catalog_entries was excluded from the core backup. Preserve the original medicine catalogue package separately before claiming full catalogue recovery."
fi
