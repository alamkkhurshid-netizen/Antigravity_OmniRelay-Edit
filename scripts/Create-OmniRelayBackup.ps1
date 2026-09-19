[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDirectory,

  [Parameter(Mandatory = $true)]
  [string]$AgeRecipient,

  # Optional original catalogue package. Including it preserves the source used
  # to rebuild the large medicine catalogue without streaming that table through
  # the IPv4 session pooler during the core operational backup.
  [string]$MedicineCatalogSourcePackage
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command is unavailable: $Name"
  }
}

Require-Command "supabase"
Require-Command "age"
Require-Command "tar"

$resolvedBackup = [System.IO.Path]::GetFullPath($BackupDirectory)
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$repositoryPrefix = $repositoryRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

if ($resolvedBackup.StartsWith($repositoryPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    $resolvedBackup.Equals($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup destination must be outside the OmniRelay application folder."
}

New-Item -ItemType Directory -Force -Path $resolvedBackup | Out-Null

$secureDatabaseUrl = Read-Host "Paste the Supabase Session Pooler connection string" -AsSecureString
$credential = [System.Net.NetworkCredential]::new("", $secureDatabaseUrl)
$databaseUrl = $credential.Password
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
  throw "A database connection string is required."
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$baseName = "omnirelay-$stamp"
$workDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString("N"))
$archive = Join-Path $workDirectory "$baseName.tar"
$encrypted = Join-Path $resolvedBackup "$baseName.backup.age"
$checksum = Join-Path $resolvedBackup "$baseName.backup.sha256"
$catalogSourceInArchive = $null

if (-not [string]::IsNullOrWhiteSpace($MedicineCatalogSourcePackage)) {
  $resolvedCatalogSource = [System.IO.Path]::GetFullPath($MedicineCatalogSourcePackage)
  if (-not (Test-Path -LiteralPath $resolvedCatalogSource -PathType Leaf)) {
    throw "Medicine catalogue source package was not found: $resolvedCatalogSource"
  }
  $catalogSourceInArchive = "medicine-catalog-source" + [System.IO.Path]::GetExtension($resolvedCatalogSource)
}

New-Item -ItemType Directory -Force -Path $workDirectory | Out-Null

try {
  & supabase db dump --db-url $databaseUrl -f (Join-Path $workDirectory "roles.sql") --role-only
  if ($LASTEXITCODE -ne 0) { throw "Role backup failed." }

  & supabase db dump --db-url $databaseUrl -f (Join-Path $workDirectory "schema.sql")
  if ($LASTEXITCODE -ne 0) { throw "Schema backup failed." }

  # The 100k+ row medicine catalogue is reproducible from its source package.
  # Exclude it from the core dump because the IPv4 session pooler can close a
  # long COPY stream before pg_dump finishes. All patient and operational data
  # remains in data.sql.
  & supabase db dump --db-url $databaseUrl -f (Join-Path $workDirectory "data.sql") --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes" -x "public.medicine_catalog_entries"
  if ($LASTEXITCODE -ne 0) { throw "Data backup failed." }

  if ($null -ne $catalogSourceInArchive) {
    Copy-Item -LiteralPath $resolvedCatalogSource -Destination (Join-Path $workDirectory $catalogSourceInArchive) -Force
  }

  $manifestContents = "roles.sql,schema.sql,data.sql"
  $catalogRecoverySource = "not_included"
  if ($null -ne $catalogSourceInArchive) {
    $manifestContents += ",$catalogSourceInArchive"
    $catalogRecoverySource = "included:$catalogSourceInArchive"
  }

  @(
    "backup_created_utc=$stamp"
    "contents=$manifestContents"
    "storage_binary_objects_included=false"
    "medicine_catalog_entries_in_data_sql=false"
    "medicine_catalog_rebuild_source=$catalogRecoverySource"
    "restore_note=circular foreign-key data requires an isolated restore procedure that handles constraints before validation"
    "restore_target=isolated_non_production_first"
  ) | Set-Content -Encoding utf8 (Join-Path $workDirectory "MANIFEST.txt")

  $archiveInputs = @("roles.sql", "schema.sql", "data.sql", "MANIFEST.txt")
  if ($null -ne $catalogSourceInArchive) { $archiveInputs += $catalogSourceInArchive }
  & tar -C $workDirectory -cf $archive @archiveInputs
  if ($LASTEXITCODE -ne 0) { throw "Backup archive creation failed." }

  & age -r $AgeRecipient -o $encrypted $archive
  if ($LASTEXITCODE -ne 0) { throw "Backup encryption failed." }

  $hash = (Get-FileHash -Algorithm SHA256 -Path $encrypted).Hash.ToLowerInvariant()
  "$hash  $([System.IO.Path]::GetFileName($encrypted))" | Set-Content -Encoding ascii $checksum

  Write-Host "Encrypted backup created: $encrypted"
  Write-Host "Checksum created: $checksum"
  Write-Warning "Supabase Storage files require a separate encrypted backup."
  if ($null -eq $catalogSourceInArchive) {
    Write-Warning "medicine_catalog_entries was excluded from the core backup. Preserve the original medicine catalogue package separately before claiming full catalogue recovery."
  }
}
finally {
  $databaseUrl = $null
  $credential = $null
  $secureDatabaseUrl.Dispose()
  if (Test-Path $workDirectory) {
    Remove-Item -LiteralPath $workDirectory -Recurse -Force
  }
}
