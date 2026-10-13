import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { defaults, validateConfig, evaluate, tfvars, rules } from './public/policy.mjs';
import { checkDatabase } from './database.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const assets = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/app.mjs', 'app.mjs'],
  ['/policy.mjs', 'policy.mjs'],
  ['/favicon.svg', 'favicon.svg'],
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function runtimeConfig(env = process.env) {
  const c = { ...defaults };
  for (const key of [
    'project_name',
    'environment',
    'location',
    'vnet_cidr',
    'public_subnet_cidr',
    'private_subnet_cidr',
  ])
    if (env[key.toUpperCase()]) c[key] = env[key.toUpperCase()];
  for (const key of ['web_source_cidrs', 'admin_source_cidrs'])
    if (env[key.toUpperCase()]) c[key] = JSON.parse(env[key.toUpperCase()]);
  for (const key of ['admin_port', 'database_port'])
    if (env[key.toUpperCase()]) c[key] = Number(env[key.toUpperCase()]);
  c.enable_workloads = env.APP_MODE === 'azure';
  return validateConfig(c);
}

export function createServer({ env = process.env, database = () => checkDatabase(env) } = {}) {
  const config = runtimeConfig(env); // Fail fast if deployed policy inputs are invalid.
  const buckets = new Map();
  let statusPromise,
    statusExpiry = 0;
  const dbStatus = () => {
    if (!statusPromise || Date.now() > statusExpiry) {
      statusPromise = database();
      statusExpiry = Date.now() + 15000;
    }
    return statusPromise;
  };
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    const headers = {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
    };
    if (env.APP_MODE === 'azure') headers['Strict-Transport-Security'] = 'max-age=31536000';
    const send = (code, data, type = 'application/json; charset=utf-8') => {
      res.writeHead(code, { ...headers, 'Content-Type': type });
      res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        // Use socket address, never trust an arbitrary X-Forwarded-For header.
        // Azure's reverse proxy shares this bucket; distributed rate limits belong at an ingress gateway.
        const ip = req.socket.remoteAddress;
        const now = Date.now();
        let bucket = buckets.get(ip);
        if (!bucket || now - bucket.start > 60000) {
          bucket = { start: now, count: 0 };
          buckets.set(ip, bucket);
        }
        if (buckets.size > 1000)
          for (const [key, b] of buckets) if (now - b.start > 60000) buckets.delete(key);
        if (++bucket.count > 600) {
          res.setHeader('Retry-After', '60');
          return send(429, { error: 'Request limit reached. Try again shortly.' });
        }
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const file = assets.get(url.pathname);
        return send(200, await readFile(path.join(publicDir, file)), types[path.extname(file)]);
      }
      if (req.method === 'GET' && url.pathname === '/healthz')
        return send(200, { status: 'alive' });
      if (req.method === 'GET' && url.pathname === '/readyz') {
        const db = await dbStatus();
        return send(db.state === 'unavailable' ? 503 : 200, {
          status: db.state === 'unavailable' ? 'not_ready' : 'ready',
          database: db.state,
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/config')
        return send(200, { config, mode: env.APP_MODE || 'demo', rules: rules(config) });
      if (req.method === 'GET' && url.pathname === '/api/status')
        return send(200, {
          mode: env.APP_MODE || 'demo',
          version: '1.0.0',
          observed_at: new Date().toISOString(),
          application: { state: 'running' },
          database: await dbStatus(),
          verification: {
            azure_resource_scan: false,
            policy_source: 'application_configuration',
            note: 'Only application and database connectivity are observed. NSGs and RBAC have not been queried.',
          },
        });
      if (req.method === 'POST' && ['/api/simulate', '/api/export'].includes(url.pathname)) {
        if (!String(req.headers['content-type'] || '').startsWith('application/json'))
          return send(415, { error: 'Use application/json.' });
        if (req.headers['origin'] && new URL(req.headers['origin']).host !== req.headers.host)
          return send(403, { error: 'Cross-origin requests are not permitted.' });
        let body = '';
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 16384)
            return send(413, { error: 'Request body is too large.' });
        }
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          return send(400, { error: 'Invalid JSON.' });
        }
        try {
          const c = validateConfig(data.config || config);
          return send(
            200,
            url.pathname === '/api/export' ? { content: tfvars(c) } : evaluate(c, data.flow || {}),
          );
        } catch (error) {
          return send(400, { error: error.message });
        }
      }
      if (['/api/simulate', '/api/export'].includes(url.pathname))
        return send(405, { error: 'Use POST.' });
      return send(404, { error: 'Resource not found.' });
    } catch {
      console.error(JSON.stringify({ event: 'request_failed', request_id: requestId }));
      if (!res.headersSent)
        send(500, { error: 'Request could not be completed.', request_id: requestId });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 12000;
  server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  const port = Number(process.env.PORT || 3000),
    host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Azure Sentinel Lab: http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    });
}
