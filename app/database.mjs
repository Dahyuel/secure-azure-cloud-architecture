import pg from 'pg';

// No user-provided SQL or hosts are accepted. A short-lived Entra token is fetched
// for each new Azure connection; the app never receives an administrator token.
export async function identityToken(env = process.env) {
  if (!env.IDENTITY_ENDPOINT || !env.IDENTITY_HEADER)
    throw new Error('Managed identity endpoint is unavailable.');
  const endpoint = new URL(env.IDENTITY_ENDPOINT);
  endpoint.searchParams.set('api-version', '2019-08-01');
  endpoint.searchParams.set('resource', 'https://ossrdbms-aad.database.windows.net');
  const response = await fetch(endpoint, {
    headers: { 'X-IDENTITY-HEADER': env.IDENTITY_HEADER },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error('Managed identity token request failed.');
  const data = await response.json();
  if (!data.access_token) throw new Error('Managed identity response contained no token.');
  return data.access_token;
}

export async function checkDatabase(env = process.env) {
  if (!env.PGHOST)
    return { state: 'not_configured', latency_ms: null, authentication: 'none', tls: false };
  const azure = env.DB_AUTH === 'managed_identity';
  const start = performance.now();
  let client;
  try {
    const password = azure ? await identityToken(env) : env.PGPASSWORD;
    if (!azure && env.APP_MODE === 'azure')
      throw new Error('Azure mode requires managed identity.');
    client = new pg.Client({
      host: env.PGHOST,
      port: Number(env.PGPORT || 5432),
      database: env.PGDATABASE || 'sentinellab',
      user: env.PGUSER || 'sentinel_app',
      password,
      ssl: azure ? { rejectUnauthorized: true } : false,
      connectionTimeoutMillis: 4000,
      query_timeout: 4000,
      statement_timeout: 4000,
      application_name: 'sentinel-health',
    });
    await client.connect();
    await client.query('SELECT 1 AS reachable');
    return {
      state: 'connected',
      latency_ms: Math.round(performance.now() - start),
      authentication: azure ? 'managed_identity' : 'local_password',
      tls: azure,
    };
  } catch {
    // Do not leak hostnames, stack traces, credentials or token contents in API responses.
    return {
      state: 'unavailable',
      latency_ms: null,
      authentication: azure ? 'managed_identity' : 'local_password',
      tls: azure,
    };
  } finally {
    if (client) await client.end().catch(() => {});
  }
}
