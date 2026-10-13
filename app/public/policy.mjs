// Pure, shared policy model. This evaluates fresh IPv4 TCP/UDP flows, not Azure.
export const defaults = Object.freeze({
  project_name: 'secure-azure',
  environment: 'production',
  location: 'eastus',
  vnet_cidr: '10.20.0.0/16',
  public_subnet_cidr: '10.20.1.0/24',
  private_subnet_cidr: '10.20.2.0/24',
  web_source_cidrs: ['0.0.0.0/0'],
  admin_source_cidrs: [],
  admin_port: 22,
  database_port: 5432,
  enable_workloads: false,
});

export function ipv4(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value))
    throw new Error('Enter a valid IPv4 address.');
  const parts = value.split('.').map(Number);
  if (parts.some((p) => p > 255)) throw new Error('IPv4 octets must be between 0 and 255.');
  return parts.reduce((sum, p) => sum * 256 + p, 0);
}

export function cidr(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(value))
    throw new Error('Enter a valid IPv4 CIDR.');
  const [address, prefix] = value.split('/');
  const ip = ipv4(address),
    bits = Number(prefix);
  if (bits > 32) throw new Error('CIDR prefix must be between 0 and 32.');
  const size = 2 ** (32 - bits),
    start = Math.floor(ip / size) * size;
  return { start, end: start + size - 1, bits };
}

export function contains(network, address) {
  const range = cidr(network),
    ip = ipv4(address);
  return ip >= range.start && ip <= range.end;
}

export function subnetHost(network) {
  const ip = cidr(network).start + 4;
  return [24, 16, 8, 0].map((shift) => Math.floor(ip / 2 ** shift) % 256).join('.');
}

export function validateConfig(input) {
  const c = { ...defaults, ...input };
  if (!/^[a-z][a-z0-9-]{2,29}$/.test(c.project_name))
    throw new Error('Project name: 3–30 lowercase letters, numbers or hyphens.');
  if (!['development', 'staging', 'production'].includes(c.environment))
    throw new Error('Select a supported environment.');
  if (!/^[a-z][a-z0-9]{2,30}$/.test(c.location))
    throw new Error('Use an Azure region identifier such as eastus.');
  const v = cidr(c.vnet_cidr),
    w = cidr(c.public_subnet_cidr),
    d = cidr(c.private_subnet_cidr);
  if ([w, d].some((s) => s.start < v.start || s.end > v.end))
    throw new Error('Both subnets must be inside the VNet.');
  if (w.start <= d.end && d.start <= w.end)
    throw new Error('The two subnet ranges must not overlap.');
  if (w.bits > 28 || d.bits > 28)
    throw new Error('Azure subnets need /28 or larger address ranges.');
  if (c.enable_workloads && w.bits > 26)
    throw new Error('The App Service integration subnet must be /26 or larger in this project.');
  for (const key of ['web_source_cidrs', 'admin_source_cidrs']) {
    if (!Array.isArray(c[key]) || c[key].length > 50)
      throw new Error('Supply no more than 50 CIDRs.');
    c[key].forEach((value) => {
      const range = cidr(value);
      if (key === 'admin_source_cidrs' && range.bits < 24)
        throw new Error('Administrative sources must be /24 or narrower; prefer /32.');
    });
  }
  if (!c.web_source_cidrs.length) throw new Error('At least one web client CIDR is required.');
  if (![22, 3389].includes(c.admin_port)) throw new Error('Management port must be 22 or 3389.');
  if (!Number.isInteger(c.database_port) || c.database_port < 1 || c.database_port > 65535)
    throw new Error('Database port must be 1–65535.');
  if (typeof c.enable_workloads !== 'boolean') throw new Error('Workload mode must be a boolean.');
  if (c.enable_workloads && c.database_port !== 5432)
    throw new Error('Managed PostgreSQL uses port 5432.');
  if (c.enable_workloads && c.admin_source_cidrs.length)
    throw new Error(
      'App Service does not expose SSH/RDP on the integration subnet; leave admin sources empty.',
    );
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, c[key]]));
}

export function rules(config) {
  const c = validateConfig(config);
  const rule = (
    tier,
    name,
    priority,
    direction,
    access,
    protocol,
    sources,
    destination,
    ports,
    note = '',
  ) => ({ tier, name, priority, direction, access, protocol, sources, destination, ports, note });
  const rows = [
    rule(
      'web',
      'web',
      100,
      'Inbound',
      'Allow',
      'Tcp',
      c.web_source_cidrs,
      c.public_subnet_cidr,
      [80, 443],
      'Baseline VM ingress; App Service ingress uses its access restrictions.',
    ),
    rule(
      'web',
      'database',
      100,
      'Outbound',
      'Allow',
      'Tcp',
      [c.public_subnet_cidr],
      c.private_subnet_cidr,
      [c.database_port],
    ),
    rule(
      'database',
      'web-to-database',
      100,
      'Inbound',
      'Allow',
      'Tcp',
      [c.public_subnet_cidr],
      c.private_subnet_cidr,
      [c.database_port],
    ),
  ];
  if (c.admin_source_cidrs.length)
    rows.push(
      rule(
        'web',
        'administration',
        110,
        'Inbound',
        'Allow',
        'Tcp',
        c.admin_source_cidrs,
        c.public_subnet_cidr,
        [c.admin_port],
      ),
    );
  if (c.enable_workloads) {
    for (const direction of ['Inbound', 'Outbound'])
      rows.push(
        rule(
          'database',
          `postgres-internal-${direction.toLowerCase()}`,
          110,
          direction,
          'Allow',
          'Tcp',
          [c.private_subnet_cidr],
          c.private_subnet_cidr,
          [5432],
          'Required PostgreSQL service communication.',
        ),
      );
    for (const tier of ['web', 'database'])
      rows.push(
        rule(
          tier,
          'entra-outbound',
          120,
          'Outbound',
          'Allow',
          'Tcp',
          [tier === 'web' ? c.public_subnet_cidr : c.private_subnet_cidr],
          'AzureActiveDirectory',
          [443],
          'Service tag: cannot resolve membership offline.',
        ),
      );
    rows.push(
      rule(
        'database',
        'storage-outbound',
        130,
        'Outbound',
        'Allow',
        'Tcp',
        [c.private_subnet_cidr],
        `Storage.${c.location}`,
        [443],
        'Regional service tag for PostgreSQL backups/WAL.',
      ),
    );
    for (const tier of ['web', 'database'])
      rows.push(
        rule(
          tier,
          'azure-dns',
          140,
          'Outbound',
          'Allow',
          '*',
          [tier === 'web' ? c.public_subnet_cidr : c.private_subnet_cidr],
          '168.63.129.16/32',
          [53],
          'Azure platform traffic can have special handling.',
        ),
      );
  }
  for (const tier of ['web', 'database'])
    for (const direction of ['Inbound', 'Outbound'])
      rows.push(
        rule(
          tier,
          `deny-all-${direction.toLowerCase()}`,
          4096,
          direction,
          'Deny',
          '*',
          ['*'],
          '*',
          ['*'],
        ),
      );
  return rows.sort((a, b) => a.priority - b.priority);
}

export function evaluate(config, flow) {
  ipv4(flow.source);
  ipv4(flow.destination);
  if (
    !['web', 'database'].includes(flow.tier) ||
    !['Inbound', 'Outbound'].includes(flow.direction) ||
    !['Tcp', 'Udp'].includes(flow.protocol)
  )
    throw new Error('Choose a valid tier, direction and protocol.');
  if (!Number.isInteger(flow.port) || flow.port < 1 || flow.port > 65535)
    throw new Error('Port must be 1–65535.');
  const trace = [];
  for (const r of rules(config).filter(
    (r) => r.tier === flow.tier && r.direction === flow.direction,
  )) {
    const src = r.sources.some((s) => s === '*' || contains(s, flow.source));
    const transport =
      (r.protocol === '*' || r.protocol === flow.protocol) &&
      (r.ports.includes('*') || r.ports.includes(flow.port));
    const serviceTag = r.destination !== '*' && !r.destination.includes('/');
    if (src && transport && serviceTag) {
      trace.push({ name: r.name, priority: r.priority, matched: null });
      return {
        decision: 'Indeterminate',
        rule: r,
        trace,
        explanation:
          'This flow could match an Azure service tag. Offline evaluation cannot confirm its current IP membership. Verify in Azure.',
      };
    }
    const matched =
      src &&
      transport &&
      (r.destination === '*' || (!serviceTag && contains(r.destination, flow.destination)));
    trace.push({ name: r.name, priority: r.priority, matched });
    if (matched)
      return {
        decision: r.access,
        rule: r,
        trace,
        explanation: `First matching rule: ${r.name}, priority ${r.priority}. This is a model of one NSG, not a live connectivity test.`,
      };
  }
  throw new Error('No terminal rule found.');
}

export function tfvars(config) {
  const c = validateConfig(config);
  return (
    '# Generated locally by Azure Sentinel Lab. Review before applying.\n# Set your subscription and Entra administrator for workload mode.\nsubscription_id = "00000000-0000-0000-0000-000000000000"\n' +
    Object.entries(c)
      .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
      .join('\n') +
    '\n'
  );
}
