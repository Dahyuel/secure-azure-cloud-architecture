import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, runtimeConfig } from '../app/server.mjs';
import { checkDatabase, identityToken } from '../app/database.mjs';

test('API validates flows, enforces headers, rejects traversal and exposes honest observations', async () => {
  let checks = 0;
  const server = createServer({
    env: { APP_MODE: 'demo' },
    database: async () => {
      checks++;
      return { state: 'not_configured', latency_ms: null, authentication: 'none', tls: false };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Azure Sentinel Lab/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('cache-control'), 'no-store');
    for (const route of ['/healthz', '/readyz', '/api/status'])
      assert.equal((await fetch(base + route)).status, 200);
    const status = await (await fetch(base + '/api/status')).json();
    assert.equal(status.verification.azure_resource_scan, false);
    assert.equal(status.database.state, 'not_configured');
    assert.equal(checks, 1, 'database checks are cached');
    const config = await (await fetch(base + '/api/config')).json();
    assert.equal(config.mode, 'demo');
    assert.equal(config.rules.length, 7);
    const post = (route, data, extra = {}) =>
      fetch(base + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extra },
        body: JSON.stringify(data),
      });
    let response = await post('/api/simulate', {
      flow: {
        tier: 'database',
        direction: 'Inbound',
        protocol: 'Tcp',
        source: '203.0.113.10',
        destination: '10.20.2.4',
        port: 5432,
      },
    });
    assert.equal((await response.json()).decision, 'Deny');
    assert.equal((await post('/api/simulate', { flow: { source: 'garbage' } })).status, 400);
    assert.equal(
      (await post('/api/export', { config: { project_name: 'x"\ninject' } })).status,
      400,
    );
    assert.equal((await post('/api/export', {}, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('/api/export', { padding: 'x'.repeat(17000) })).status, 413);
    assert.equal(
      (
        await fetch(base + '/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{bad',
        })
      ).status,
      400,
    );
    assert.equal((await fetch(base + '/api/export', { method: 'POST', body: 'text' })).status, 415);
    assert.equal((await fetch(base + '/api/export')).status, 405);
    for (const route of [
      '/.env',
      '/main.tf',
      '/package-lock.json',
      '/%2e%2e%2f.env',
      '/api/unknown',
    ])
      assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await post('/api/export', {})).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test('unavailable database fails readiness without failing liveness', async () => {
  const server = createServer({ env: {}, database: async () => ({ state: 'unavailable' }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/readyz')).status, 503);
    assert.equal((await fetch(base + '/healthz')).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test('runtime config honors Terraform settings and rejects invalid deployment values', () => {
  const config = runtimeConfig({
    APP_MODE: 'azure',
    PUBLIC_SUBNET_CIDR: '10.20.4.0/24',
    WEB_SOURCE_CIDRS: '["198.51.100.0/24"]',
  });
  assert.equal(config.public_subnet_cidr, '10.20.4.0/24');
  assert.equal(config.enable_workloads, true);
  assert.throws(() => runtimeConfig({ DATABASE_PORT: 'not-a-port' }));
});
test('no database is honestly reported as unconfigured; Azure rejects password auth', async () => {
  assert.equal((await checkDatabase({})).state, 'not_configured');
  assert.equal(
    (
      await checkDatabase({
        APP_MODE: 'azure',
        PGHOST: 'localhost',
        DB_AUTH: 'local_password',
        PGPASSWORD: 'test-only',
      })
    ).state,
    'unavailable',
  );
  await assert.rejects(identityToken({}), /unavailable/);
});

test('managed identity requests the PostgreSQL audience and never a DB administrator token', async (context) => {
  let requested;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    requested = { url: new URL(url), options };
    return new Response(JSON.stringify({ access_token: 'synthetic-test-token' }), { status: 200 });
  });
  const token = await identityToken({
    IDENTITY_ENDPOINT: 'http://127.0.0.1/identity',
    IDENTITY_HEADER: 'synthetic-test-header',
  });
  assert.equal(token, 'synthetic-test-token');
  assert.equal(
    requested.url.searchParams.get('resource'),
    'https://ossrdbms-aad.database.windows.net',
  );
  assert.equal(requested.url.searchParams.get('api-version'), '2019-08-01');
  assert.equal(requested.options.headers['X-IDENTITY-HEADER'], 'synthetic-test-header');
});
