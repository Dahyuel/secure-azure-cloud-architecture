// Run only as an authorized Entra database administrator from a VNet-connected
// operator environment. Never add ADMIN_ACCESS_TOKEN to App Service settings.
import pg from 'pg';
import { fileURLToPath } from 'node:url';

export async function bootstrap(env = process.env) {
  const { ADMIN_ACCESS_TOKEN, ADMIN_PGUSER, APP_PRINCIPAL_ID, PGHOST } = env;
  if (!ADMIN_ACCESS_TOKEN || !ADMIN_PGUSER || !PGHOST || !APP_PRINCIPAL_ID)
    throw new Error(
      'Set ADMIN_ACCESS_TOKEN, ADMIN_PGUSER, APP_PRINCIPAL_ID and PGHOST for the operator session.',
    );
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(APP_PRINCIPAL_ID))
    throw new Error('APP_PRINCIPAL_ID must be the web app managed identity object UUID.');
  const options = {
    host: PGHOST,
    user: ADMIN_PGUSER,
    password: ADMIN_ACCESS_TOKEN,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
  };
  const admin = new pg.Client({ ...options, database: 'postgres' });
  try {
    await admin.connect();
    const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'sentinel_app'");
    if (exists.rowCount)
      throw new Error(
        'sentinel_app already exists. Refusing to assume its identity binding; inspect it before rerunning or rotating the app identity.',
      );
    await admin.query(
      'SELECT * FROM pg_catalog.pgaadauth_create_principal_with_oid($1,$2,$3,false,false)',
      ['sentinel_app', APP_PRINCIPAL_ID, 'service'],
    );
  } finally {
    await admin.end().catch(() => {});
  }
  const db = new pg.Client({ ...options, database: 'sentinellab' });
  try {
    await db.connect();
    await db.query('BEGIN');
    await db.query('REVOKE CONNECT, TEMPORARY ON DATABASE sentinellab FROM PUBLIC');
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await db.query('GRANT CONNECT ON DATABASE sentinellab TO sentinel_app');
    await db.query(
      'ALTER ROLE sentinel_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION',
    );
    await db.query('ALTER ROLE sentinel_app SET default_transaction_read_only = on');
    await db.query("ALTER ROLE sentinel_app SET statement_timeout = '4s'");
    await db.query('COMMIT');
    console.log(
      'Created the managed identity binding and CONNECT-only runtime role. No table or administrator privileges were granted.',
    );
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end().catch(() => {});
    delete env.ADMIN_ACCESS_TOKEN;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  bootstrap().catch(() => {
    console.error(
      'Database bootstrap failed. Verify identity binding, administrator token, private DNS and connectivity; inspect partial role creation before retrying.',
    );
    process.exitCode = 1;
  });
