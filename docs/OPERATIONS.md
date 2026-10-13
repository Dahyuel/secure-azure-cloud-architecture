# Operations and recovery

## Observability

- `/healthz`: HTTP process liveness, no DB query.
- `/readyz`: fails with 503 for an unavailable configured DB; demo mode has no required DB.
- `/api/status`: generic timestamped app/DB `SELECT 1`, 15-second cache, no raw errors/hosts/tokens.
- Azure diagnostics: App Service and PostgreSQL logs/metrics to Log Analytics; 30-day retention and 1 GB daily quota. Quotas can create visibility gaps.
- CPU alert: PostgreSQL average >80% for 15 minutes; no notification action group. Attach an approved incident destination before relying on alerts operationally.

Example queries for the default AzureDiagnostics sink:

```kusto
AzureDiagnostics
| where TimeGenerated > ago(1h)
| where ResourceProvider == "MICROSOFT.WEB"
| summarize Events=count() by Category, bin(TimeGenerated, 5m)
```

```kusto
AzureDiagnostics
| where TimeGenerated > ago(1h)
| where ResourceProvider == "MICROSOFT.DBFORPOSTGRESQL"
| project TimeGenerated, Category, Resource
| order by TimeGenerated desc
```

These are examples, not recorded evidence. Connection logging is enabled; broad SQL statement logging is omitted to avoid sensitive query contents.

## DB unavailable

1. Check app liveness independently of DB readiness.
2. Confirm private FQDN resolution from the App Service console.
3. Inspect integration/delegation, TCP 5432, platform exceptions and NAT associations.
4. Confirm `sentinel_app` is bound to the current application object ID.
5. Check Entra auth/token endpoint and verified TLS without disabling certificate checks.
6. Inspect diagnostics with authorized operator access; keep raw errors out of public responses.

Do not open DB public access or disable TLS validation to fix connectivity.

## Bootstrap partial failure and identity rotation

Identity binding runs in `postgres`; grants run in `sentinellab`. These are not one cross-database transaction. Failure can leave an unprivileged role. The script refuses to assume an existing binding.

As Entra administrator, inspect `pg_catalog.pgaadauth_list_principals(false)` and database grants. For a confirmed disposable project role, revoke/remove its dependencies in the app DB, drop it and rerun bootstrap with the correct object ID. Never drop a role owning unrelated data. Recreating the system identity requires an intentional rebind and new acceptance evidence.

Read-only defaults are not the authorization boundary (a login can change them); CONNECT-only grants and absent elevated privileges are the boundary. Future business tables need narrowly reviewed grants.

## Backup and restore

Retention is 14 days; default lab has no geo backup/HA. Verify support and replacement implications before enabling those inputs. Restore to a separate isolated test server, inspect restored timestamp/private networking, authorize only a test identity, verify workload data/health, record measured recovery time/data age, and intentionally manage/import the restored server before promotion. A configured backup is not proof of recovery.

## Incident response

Restrict app ingress, close SCM, revoke runtime DB login as an authorized operator, preserve sanitized diagnostics, investigate and replace affected code/identities. NSG changes may leave established connections; revoke sessions explicitly when needed. Never put tokens/state in public issues. Record chronology, affected assets, containment, provenance and recovery acceptance.

## Local operation and release

`docker compose down` preserves data; `down -v` deletes it. Initialization runs only on a fresh volume. Editing `.env` does not rotate stored DB credentials; use authorized SQL rotation or intentionally reset disposable data.

For releases: review locks/dependencies, run Node/Terraform/container checks, review IaC findings, produce checksum, deploy through temporary trusted SCM, close SCM, verify health and live acceptance, then record actual results in VALIDATION.md. Code rollback and DB/identity/state rollback require separate review.
