# Coordinated release safety checklist

This runbook is preparation only. It does not identify or assume a production
database provider, Vercel project, EAS branch mapping, or installed device
inventory.

## Numbered schema migrations only

From `backend`, the dedicated command is:

```powershell
npm run migrate:schema-only
```

It loads the configured database connection and calls only
`src/config/schemaMigrations.js`. It does not call `initDb`, seed accounts,
repair or deduplicate evacuation centers, update boundary seed data, or delete
unsupported boundaries or Barangay accounts.

Defaults:

- advisory-lock acquisition timeout: 5 seconds;
- each migration statement timeout: 30 seconds;
- external process deadline: 120 seconds, exiting with code 124.

The defaults can be overridden for a reviewed maintenance procedure with
`SCHEMA_MIGRATION_LOCK_TIMEOUT_MS`, `SCHEMA_MIGRATION_STATEMENT_TIMEOUT_MS`, and
`SCHEMA_MIGRATION_EXECUTION_TIMEOUT_MS`. Do not increase them during an incident
without database-owner approval. A terminated connection rolls back its open
PostgreSQL transaction, but operators must still verify `schema_migrations` and
the expected schema before continuing.

Do not use the older `npm run migrate` command for this release. It invokes the
broader initialization path and can perform data repairs and cleanup.

## Provider-neutral backup and restore verification

Before the maintenance window:

1. Identify the actual production database service, database name, region,
   PostgreSQL version, retention policy, and person authorized to restore it.
2. Select that provider's documented consistent backup or snapshot mechanism.
   Do not copy commands from another provider's runbook.
3. Confirm the backup includes schema, data, constraints, functions, triggers,
   indexes, sequences, and the `schema_migrations` table.
4. Record the backup/snapshot identifier, UTC creation time, source database,
   encryption/access controls, and retention expiry.
5. Verify the backup reports success and a non-zero artifact/snapshot size.
6. Restore it into an isolated, non-production database using the provider's
   documented restore procedure. Never overwrite production for this check.
7. Compare schema version, table row counts, critical incident/dispatch counts,
   functions, triggers, indexes, and representative read-only queries between
   the source snapshot and isolated restore.
8. Record restore duration and the exact rollback decision owner. Confirm that
   restoring after writes resume would lose or require reconciliation of newer
   production data.
9. At the maintenance window, quiesce application writers and take a new backup.
   Do not migrate if backup or isolated-restore verification is incomplete.

## Android client compatibility

Rescue requests require real valid coordinates. Location capture time and
accuracy are advisory metadata and may be absent on older Android clients;
they are not authentication signals and do not independently block rescue.
The backend still rejects missing or invalid coordinates and remains
authoritative for service-area and Test Mode decisions.

## Read-only identity verification

Local configuration identifies Android versionCode 10, runtime 1.0.4, EAS
channel `production-v10-performance`, backend root `backend`, and the unified
staff/Barangay portal root `admin-web`. These values do not prove live linkage.

With authorized Expo credentials, run from `user-app`:

```powershell
npx eas-cli account:view
npx eas-cli project:info
npx eas-cli channel:view production-v10-performance --json
npx eas-cli branch:list --json
# Use the branch returned by channel:view:
npx eas-cli branch:view <mapped-branch-name> --json
# Use an update group ID returned by branch:view:
npx eas-cli update:view <update-group-id> --json
npx eas-cli build:list --platform android --build-profile production-v10-performance --limit 10 --json
```

Confirm project owner/ID, channel-to-branch mapping, Android platform, runtime
1.0.4, and the build's versionCode 10. These commands inspect state; do not run
`channel:edit`, `update`, `build`, or any rollback/publication command.

With authorized Vercel credentials, do not run `vercel link` in either preserved
worktree. It writes local linkage metadata and can create a project if the wrong
interactive choice is made. Use explicit project names and scope:

```powershell
npx vercel whoami
npx vercel project ls --scope <team-scope>
npx vercel project inspect <backend-project-name> --scope <team-scope>
npx vercel list <backend-project-name> --scope <team-scope>
npx vercel project inspect <admin-web-project-name> --scope <team-scope>
npx vercel list <admin-web-project-name> --scope <team-scope>
```

In the dashboard, verify each inspected project's Git repository, production
branch, root directory (`backend` or `admin-web`), production domains, and
environment-variable target. Do not run `deploy`, `promote`, or `alias`.
