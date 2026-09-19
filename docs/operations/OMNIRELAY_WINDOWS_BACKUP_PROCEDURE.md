# OmniRelay Windows encrypted backup procedure

## Purpose

This runbook records the successful first OmniRelay backup procedure so it can be repeated on a replacement laptop or by an authorised operator without rediscovering each step.

The backup protects the Supabase database configuration and rows used by OmniRelay: roles, schema, clinic operations, patient and booking records, consents, appointments, prescriptions, payments, WhatsApp operational evidence and related application data.

It is an encrypted logical database backup. It is **not** a complete disaster-recovery solution until a restore is practised in an isolated non-production environment.

## Important safety rules

- Never paste the database password, connection string, Supabase access token, private `age` key, service-role key or WhatsApp credentials into chat, email or source control.
- Keep the backup files and the private encryption key in separate controlled locations.
- Never restore a drill backup into the live production Supabase project.
- Storage binary files (patient photos, reports and documents) are not included by this database backup. They need a separate encrypted Storage backup.
- The backup command only reads the live database. It does not deploy, migrate, modify, delete or send messages.

## Successful first backup evidence

| Item | Recorded value |
| --- | --- |
| Backup timestamp | `2026-09-11T01:29:45Z` |
| Encrypted artifact | `omnirelay-20260911T012945Z.backup.age` |
| Checksum artifact | `omnirelay-20260911T012945Z.backup.sha256` |
| Checksum verification | Passed — generated and recorded SHA-256 matched exactly |
| Role export | Passed |
| Schema export | Passed |
| Data export | Passed |

Circular foreign-key warnings for `prescriptions`, `whatsapp_acceptance_test_runs`, and `whatsapp_acceptance_payments` were expected warnings. They do not invalidate the backup, but a future isolated restore must handle those constraints before final validation.

## One-time setup on a new Windows laptop

Open **PowerShell** in the OmniRelay project folder. The folder used in the first successful run was:

```text
C:\Users\khurs\OneDrive\Desktop\Chatgpt_OmniRelay
```

### 1. Install required tools

Install Scoop if it is not already installed, then run:

```powershell
scoop install supabase
scoop bucket add extras
scoop install age
```

Install Docker Desktop and Windows Subsystem for Linux (WSL) if required by Docker Desktop:

```powershell
wsl --install
```

Restart Windows after installing WSL. Open Docker Desktop and wait until its engine is running.

### 2. Verify tools

In a normal PowerShell window, run:

```powershell
supabase --version
age --version
tar --version
docker --version
```

All four commands must return a version. Docker is required because the Supabase CLI runs the PostgreSQL dump utility in a container.

### 3. Create and protect the encryption key

Create a key folder outside the project folder:

```powershell
New-Item -ItemType Directory -Force -Path "C:\Users\khurs\OmniRelay-Keys"
age-keygen -o "C:\Users\khurs\OmniRelay-Keys\backup-key.txt"
```

The command prints an `age1...` public recipient. Record that public recipient in a private password manager or secure note. It is safe to use in commands; the private key file is not safe to share.

Restrict the private-key file to the Windows user:

```powershell
icacls "C:\Users\khurs\OmniRelay-Keys\backup-key.txt" /inheritance:r
icacls "C:\Users\khurs\OmniRelay-Keys\backup-key.txt" /grant:r "$env:USERNAME`:(F)"
icacls "C:\Users\khurs\OmniRelay-Keys\backup-key.txt"
```

The final output should show only the intended Windows user with `(F)` access.

### 4. Create a backup destination outside the project

Do not put backups inside the OmniRelay repository. The successful folder was:

```text
C:\Users\khurs\OneDrive\Desktop\OmniRelay-Backups
```

Create it if needed:

```powershell
New-Item -ItemType Directory -Force -Path "C:\Users\khurs\OneDrive\Desktop\OmniRelay-Backups"
```

## Create a backup

1. Open Supabase Dashboard for the existing OmniRelay project.
2. Select **Connect → Session Pooler**.
3. Copy the full connection string using port `5432` (the string ends with `:5432/postgres`).
4. Replace `[YOUR-PASSWORD]` locally with the actual database password. Do not save or share the completed string.
5. Percent-encode reserved password characters inside the connection string. For example, a password containing `@` uses `%40` in the connection string:

```text
ExampleOnly@2026  →  ExampleOnly%402026
```

Do not change the final `@` that separates the password from the database host.

6. From the project folder, run the following. Replace only the public `age1...` recipient with the one from your own key file:

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\Create-OmniRelayBackup.ps1" `
  -BackupDirectory "C:\Users\khurs\OneDrive\Desktop\OmniRelay-Backups" `
  -AgeRecipient "age1[YOUR_PUBLIC_RECIPIENT]"
```

7. When prompted, paste the completed Session Pooler connection string into the hidden prompt.

Success is confirmed only when PowerShell prints both lines:

```text
Encrypted backup created: ... .backup.age
Checksum created: ... .backup.sha256
```

## Verify every backup

Run this immediately after a successful backup:

```powershell
$backup = Get-ChildItem "C:\Users\khurs\OneDrive\Desktop\OmniRelay-Backups\*.backup.age" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1

(Get-FileHash -Algorithm SHA256 $backup.FullName).Hash.ToLowerInvariant()
Get-Content ($backup.FullName -replace '\.backup\.age$', '.backup.sha256')
```

The two SHA-256 values must match exactly. If they do not match, do not use the backup; retain the evidence and create a fresh one.

## Retention and handover

1. Keep the `.backup.age` and `.backup.sha256` files together.
2. Keep the private `backup-key.txt` separately.
3. Make a second encrypted copy of the backup files on another controlled drive or storage location.
4. Keep at least seven daily copies during pilot operations.
5. Record the timestamp, filename and a successful checksum match in the operations log. Do not record the database password.

## Known limits and next control

- This backup includes database metadata for Storage, not the Storage object bytes.
- The large `medicine_catalog_entries` reference dataset can make a Session Pooler export unreliable. If a future script marks it excluded, preserve the original approved `CommonDrugCodesForIndia_FlatFilePackage` zip separately and include it with the backup when available.
- The next recovery control is an **explicitly authorised isolated restore drill**. It requires a separate non-production target and must use synthetic or expressly authorised data. Do not create that target or perform a restore without owner approval.
