# Replace the Render PostgreSQL database from the local `cddrmd` database

## Confirmed databases

- Source: `PostgreSQL 18 > Databases > cddrmd` (local, 15 tables)
- Destination: `CDRRMD Render Database > Databases > cddrmd_z9ga`
- Source backup: `database-backups/cddrmd_latest.backup`

The backup is PostgreSQL Custom format and includes schema, constraints,
sequences, and data. The `database-backups` directory is excluded from Git.

## 1. Prevent writes during the replacement

In Render, open the `CDRRMD` web service and suspend it. Do not suspend the
PostgreSQL database. Leave `cddrmd-database` available while backing up and
restoring.

## 2. Back up the current Render database

In pgAdmin:

1. Expand **CDRRMD Render Database > Databases**.
2. Right-click **cddrmd_z9ga** and select **Backup**.
3. Set the filename to
   `C:\Users\gina\Downloads\CDRRMD\database-backups\render_before_restore.backup`.
4. Set **Format** to **Custom**.
5. Leave both schema and data enabled.
6. Click **Backup** and confirm that the process completes successfully.

Do not continue if this backup fails.

## 3. Restore the local backup into Render

In pgAdmin:

1. Right-click **cddrmd_z9ga** again and select **Restore**.
2. Select
   `C:\Users\gina\Downloads\CDRRMD\database-backups\cddrmd_latest.backup`.
3. Set **Format** to **Custom or tar** if pgAdmin does not detect it.
4. In **Data Options**, keep **Pre-data**, **Data**, and **Post-data** enabled.
5. In **Query Options**, enable:
   - **Clean before restore**
   - **Include IF EXISTS clause**
   - **No owner**
   - **No privileges**
   - **Exit on error**
6. Click **Restore** and wait for a successful completion message.

Do not use the Render internal hostname from the local computer. pgAdmin's saved
`CDRRMD Render Database` connection uses the external Render hostname.

## 4. Verify before resuming the web service

Refresh **Schemas > public > Tables** under `cddrmd_z9ga`. These three tables
must now appear in addition to the original 12:

- `evacuation_admissions`
- `evacuation_count_logs`
- `evacuation_departures`

The total application table count should be 15.

## 5. Resume and verify

1. Resume the `CDRRMD` Render web service.
2. Wait for it to show **Deployed**.
3. Open the backend `/api/health` URL and confirm `{"status":"ok"}`.
4. Test login and inspect important records in the Vercel application.

No Vercel environment variable or Render database credential needs to change,
because the restore replaces the contents of the existing `cddrmd_z9ga`
database rather than switching to a new database.

## Rollback

If validation fails, keep the web service suspended and restore
`render_before_restore.backup` into `cddrmd_z9ga` using the same Restore options.
