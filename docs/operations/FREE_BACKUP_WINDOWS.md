# Free pilot backup on Windows

This is the approved zero-subscription path for the OmniRelay pilot. It creates an encrypted local database backup. It does not enable Supabase Pro, PITR or paid cloud storage.

## One-time setup

1. Install Docker Desktop, the current Supabase CLI and `age` on the trusted operator computer.
2. Verify each command in PowerShell:

   ```powershell
   supabase --version
   supabase db dump --help
   age --version
   tar --version
   ```

3. Create an `age` encryption key on a separate, access-controlled drive:

   ```powershell
   age-keygen -o "D:\OmniRelay-Keys\backup-key.txt"
   ```

4. Record the printed public recipient beginning with `age1`. Store the private `backup-key.txt` separately from the backup files. Never upload or paste it into chat.
5. In Supabase Dashboard, use **Connect → Session pooler** and obtain the connection string. Do not save it in this project or in a script.

## Create the first backup

Choose an external or removable drive folder, for example `E:\OmniRelay-Backups`. From the OmniRelay project folder run:

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\Create-OmniRelayBackup.ps1" `
  -BackupDirectory "E:\OmniRelay-Backups" `
  -AgeRecipient "age1[YOUR_PUBLIC_RECIPIENT]"
```

The script asks for the database connection string as hidden input. It creates:

- `omnirelay-[timestamp].backup.age` — encrypted roles, schema and data.
- `omnirelay-[timestamp].backup.sha256` — integrity checksum.

Plaintext dump files are created only inside a restricted temporary folder and removed when the command finishes or fails.

### Medicine catalogue note

The Windows script excludes the large `medicine_catalog_entries` reference table from the core data dump because an IPv4 Session Pooler can close its long export stream. This does not exclude patient, booking, consent, payment, prescription or WhatsApp operational data.

If you retain the original approved `CommonDrugCodesForIndia_FlatFilePackage` zip, include it in the encrypted archive:

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\Create-OmniRelayBackup.ps1" `
  -BackupDirectory "E:\OmniRelay-Backups" `
  -AgeRecipient "age1[YOUR_PUBLIC_RECIPIENT]" `
  -MedicineCatalogSourcePackage "E:\Approved-Sources\CommonDrugCodesForIndia_FlatFilePackage.zip"
```

If you do not have that original package, the core backup is still valuable, but its manifest will correctly mark medicine-catalogue recovery as incomplete.

## Verify and retain

1. Confirm both files exist and are non-empty.
2. Verify the checksum:

   ```powershell
   $backup = Get-ChildItem "E:\OmniRelay-Backups\*.backup.age" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   (Get-FileHash -Algorithm SHA256 $backup.FullName).Hash.ToLowerInvariant()
   Get-Content ($backup.FullName -replace '\.backup\.age$', '.backup.sha256')
   ```

3. Keep two encrypted copies on two separate controlled drives. Keep the private encryption key separate from both.
4. Retain seven daily copies during pilot testing and delete expired copies through an authorized operator process.
5. Record the backup timestamp and checksum in the restore-drill checklist. Do not record the database password.

## Important limitation

This database backup includes Storage metadata but not uploaded file bytes. Patient photos, reports and prescription files require a separate Storage-object backup before production clinical-document use. Restore planning must also handle circular foreign-key data in an isolated target. Do not treat this database backup as complete disaster recovery until an isolated restore drill passes.
