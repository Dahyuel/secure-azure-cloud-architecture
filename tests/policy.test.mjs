import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  ipv4,
  cidr,
  contains,
  validateConfig,
  evaluate,
  rules,
  tfvars,
} from '../app/public/policy.mjs';

const flow = {
  tier: 'web',
  direction: 'Inbound',
  protocol: 'Tcp',
  source: '203.0.113.10',
  destination: '10.20.1.4',
  port: 443,
};
test('IPv4 parsing handles upper addresses without signed overflow', () => {
  assert.equal(ipv4('255.255.255.255'), 4294967295);
  assert.equal(cidr('0.0.0.0/0').end, 4294967295);
  assert.equal(contains('192.168.1.0/24', '192.168.2.0'), false);
  assert.throws(() => ipv4('256.1.1.1'));
  assert.throws(() => cidr('10.0.0.0/33'));
});
test('default web policy permits TCP HTTP/HTTPS but rejects SSH, UDP and other ports', () => {
  for (const port of [80, 443])
    assert.equal(evaluate(defaults, { ...flow, port }).decision, 'Allow');
  for (const port of [22, 3389, 8080])
    assert.equal(evaluate(defaults, { ...flow, port }).decision, 'Deny');
  assert.equal(evaluate(defaults, { ...flow, protocol: 'Udp' }).decision, 'Deny');
});
test('management is restricted to trusted CIDRs and a single selected protocol', () => {
  const config = { ...defaults, admin_source_cidrs: ['198.51.100.7/32'] };
  assert.equal(evaluate(config, { ...flow, source: '198.51.100.7', port: 22 }).decision, 'Allow');
  assert.equal(evaluate(config, { ...flow, source: '198.51.100.8', port: 22 }).decision, 'Deny');
  assert.equal(evaluate(config, { ...flow, source: '198.51.100.7', port: 3389 }).decision, 'Deny');
  assert.throws(() => validateConfig({ ...config, admin_source_cidrs: ['0.0.0.0/0'] }));
});
test('database allows only the configured TCP port from web tier', () => {
  const db = { ...flow, tier: 'database', destination: '10.20.2.4', port: 5432 };
  assert.equal(evaluate(defaults, db).decision, 'Deny');
  assert.equal(evaluate(defaults, { ...db, source: '10.20.1.4' }).decision, 'Allow');
  assert.equal(evaluate(defaults, { ...db, source: '10.20.1.4', port: 3306 }).decision, 'Deny');
  assert.equal(evaluate(defaults, { ...db, source: '10.20.2.5' }).decision, 'Deny');
  assert.equal(
    evaluate(defaults, { ...db, source: '10.20.1.4', protocol: 'Udp' }).decision,
    'Deny',
  );
});
test('initiated egress is restricted in both baseline tiers', () => {
  assert.equal(
    evaluate(defaults, {
      ...flow,
      direction: 'Outbound',
      source: '10.20.1.4',
      destination: '8.8.8.8',
    }).decision,
    'Deny',
  );
  assert.equal(
    evaluate(defaults, {
      ...flow,
      direction: 'Outbound',
      source: '10.20.1.4',
      destination: '10.20.2.4',
      port: 5432,
    }).decision,
    'Allow',
  );
  assert.equal(
    evaluate(defaults, {
      ...flow,
      tier: 'database',
      direction: 'Outbound',
      source: '10.20.2.4',
      destination: '10.20.1.4',
      port: 5432,
    }).decision,
    'Deny',
  );
});
test('restricted web sources reject non-approved clients', () => {
  assert.equal(
    evaluate({ ...defaults, web_source_cidrs: ['198.51.100.0/24'] }, flow).decision,
    'Deny',
  );
});
test('configuration rejects overlap, outside ranges and undersized subnet', () => {
  assert.throws(
    () => validateConfig({ ...defaults, private_subnet_cidr: '10.20.1.128/25' }),
    /overlap/,
  );
  assert.throws(
    () => validateConfig({ ...defaults, private_subnet_cidr: '10.21.2.0/24' }),
    /inside/,
  );
  assert.throws(() => validateConfig({ ...defaults, public_subnet_cidr: '10.20.1.0/30' }), /\/28/);
  assert.throws(() => validateConfig({ ...defaults, database_port: 1.5 }));
  assert.throws(() => validateConfig({ ...defaults, enable_workloads: true, database_port: 3306 }));
});
test('workload exceptions allow internal postgres and mark service tags indeterminate', () => {
  const config = { ...defaults, enable_workloads: true };
  assert.equal(
    evaluate(config, {
      ...flow,
      tier: 'database',
      source: '10.20.2.4',
      destination: '10.20.2.5',
      port: 5432,
    }).decision,
    'Allow',
  );
  assert.equal(
    evaluate(config, {
      ...flow,
      tier: 'database',
      direction: 'Outbound',
      source: '10.20.2.4',
      destination: '8.8.8.8',
    }).decision,
    'Indeterminate',
  );
  assert.equal(rules(config).length, 14);
});
test('default deny priority precedes Azure default rules and result trace stops at first match', () => {
  const result = evaluate(defaults, { ...flow, port: 22 });
  assert.equal(result.rule.priority, 4096);
  assert.equal(result.trace.at(-1).matched, true);
  assert.ok(result.rule.priority < 65000);
});
test('exports exclude unknown fields and cannot inject HCL', () => {
  assert.throws(() => tfvars({ ...defaults, project_name: 'evil"\nmalicious=true' }));
  const text = tfvars({ ...defaults, secret: 'never-export' });
  assert.ok(!text.includes('never-export'));
  assert.match(text, /admin_source_cidrs = \[\]/);
});
