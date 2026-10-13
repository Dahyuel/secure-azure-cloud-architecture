import { defaults, validateConfig, rules, evaluate, tfvars, subnetHost } from './policy.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const labels = {
  overview: 'Overview',
  architecture: 'Architecture',
  policies: 'Security policies',
  simulator: 'Traffic simulator',
  configure: 'Deployment studio',
  evidence: 'Evidence & health',
  guide: 'Field guide',
};
let config = { ...defaults },
  runtime = { ...defaults },
  mode = 'demo',
  status = null,
  currentView = 'overview',
  simulation = null,
  policyFilters = { tier: 'all', direction: 'all', query: '' };
let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function heading(kicker, title, description, actions = '') {
  return `<section class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</section>`;
}
function button(text, action, style = '') {
  return `<button type="button" class="btn ${style}" data-action="${action}">${text}</button>`;
}
function panel(title, subtitle, body, extra = '', cls = '') {
  return `<section class="panel ${cls}"><div class="panel-head"><div><h2>${title}</h2><p>${subtitle}</p></div>${extra}</div>${body}</section>`;
}
function tag(text, type = '') {
  return `<span class="tag ${type}">${escape(text)}</span>`;
}
const notice = (text) =>
  `<div class="notice"><span class="notice-icon" aria-hidden="true">ⓘ</span><span>${text}</span></div>`;
function modeNotice() {
  return notice(
    `<strong>${mode === 'azure' ? 'Azure runtime' : 'Local engineering lab'}.</strong> Policies below are a configuration model. Only the health page measures runtime connectivity; no Azure resource scan is performed. Unsaved studio changes affect the model only.`,
  );
}
function topology() {
  const w = config.enable_workloads;
  return `<div class="topology"><div class="topo-client"><span class="internet-icon" aria-hidden="true">◎</span> Internet / approved clients</div><div class="flow-link"><span>${w ? 'HTTPS · App Service ingress' : 'TCP 80 / 443 · web ingress'}</span></div>${w ? '<button class="tier appservice" data-node="ingress"><div class="tier-title"><span class="resource-icon">◈</span>Azure App Service · managed HTTPS</div><div class="tier-foot">Public endpoint · IP access restrictions · outbound VNet integration</div></button><div class="flow-link"><span>Private outbound path</span></div>' : ''}<div class="vnet-frame"><div class="vnet-label"><span>AZURE VIRTUAL NETWORK</span><span class="mono">${escape(config.vnet_cidr)}</span></div><div class="tier-row"><button class="tier" data-node="web"><div class="tier-title"><span class="resource-icon">▣</span>${w ? 'Web integration subnet' : 'Public / DMZ subnet'}</div><code>${escape(config.public_subnet_cidr)}</code><div class="tier-foot"><span class="pulse-dot"></span>${w ? 'Dedicated App Service delegation' : 'HTTP / HTTPS · restricted admin'}</div></button><button class="tier database" data-node="database"><div class="tier-title"><span class="resource-icon">▱</span>Private database subnet</div><code>${escape(config.private_subnet_cidr)}</code><div class="tier-foot"><span class="pulse-dot"></span>${w ? 'PostgreSQL · no public endpoint' : 'No direct internet ingress'}</div></button></div><div class="tier-arrow"><span class="arrow-line"></span>Web → database · TCP ${config.database_port} →<span class="arrow-line"></span></div></div><div class="topology-legend"><span><i class="legend-dot"></i>Web trust boundary</span><span><i class="legend-dot teal"></i>Private tier</span><span><i class="legend-dot gray"></i>Explicit deny rules</span></div></div>`;
}
function controls() {
  return `<div class="panel-body"><div class="control"><span class="check-icon">✓</span><div><strong>Network segmentation</strong><p>Dedicated web and database subnets. Explicit denies override VNet defaults.</p></div></div><div class="control"><span class="check-icon">✓</span><div><strong>Least privilege by design</strong><p>Reader RBAC at resource-group scope. ${config.enable_workloads ? 'Runtime database identity is not an administrator.' : 'Management ingress is disabled by default.'}</p></div></div><div class="control"><span class="check-icon">✓</span><div><strong>Private database access</strong><p>Only the configured database port is available from the web tier.</p></div></div><div class="control"><span class="check-icon">✓</span><div><strong>Reviewable infrastructure</strong><p>Versioned Terraform, saved plans, automated tests and security checks.</p></div></div></div>`;
}
function statusRows() {
  return `<div class="panel-body"><div class="status-row"><span class="bullet-status"></span><div><strong>Application server</strong><small>${status ? 'Observed HTTP response' : 'Loading observation…'}</small></div>${tag(status ? 'Running' : 'Checking', 'green')}</div><div class="status-row"><span class="bullet-status ${status?.database.state === 'connected' ? '' : 'gray'}"></span><div><strong>Database connection</strong><small>${status?.database.state === 'connected' ? `${status.database.latency_ms} ms · ${status.database.authentication}` : 'Configure local Compose or deploy to Azure'}</small></div>${tag(status?.database.state === 'connected' ? 'Connected' : status?.database.state === 'unavailable' ? 'Unavailable' : 'Not configured', status?.database.state === 'connected' ? 'green' : '')}</div><div class="status-row"><span class="bullet-status gray"></span><div><strong>Azure controls</strong><small>NSG / RBAC verification requires Azure evidence</small></div>${tag('Not scanned')}</div></div>`;
}
function overview() {
  const rows = rules(config);
  return (
    heading(
      'SECURE BY DESIGN',
      'Your cloud. Clear boundaries.',
      'Explore the architecture, challenge its policies, and build a deployment you can defend.',
      button('↓ Export configuration', 'export') +
        button('⇄ Test a traffic flow', 'simulator', 'primary'),
    ) +
    modeNotice() +
    `<div class="metric-grid"><article class="metric"><div class="metric-symbol">⌘</div><div class="metric-label">Network segments</div><div class="metric-value">02</div><div class="metric-note"><span class="small-status">ISOLATED</span>Web + database tiers</div></article><article class="metric"><div class="metric-symbol">▤</div><div class="metric-label">Custom NSG rules</div><div class="metric-value">${String(rows.length).padStart(2, '0')}</div><div class="metric-note">${rows.filter((r) => r.access === 'Allow').length} allow · ${rows.filter((r) => r.access === 'Deny').length} explicit deny</div></article><article class="metric"><div class="metric-symbol">⌁</div><div class="metric-label">Database ingress port</div><div class="metric-value">${config.database_port}</div><div class="metric-note">TCP · web subnet source only</div></article><article class="metric"><div class="metric-symbol">♧</div><div class="metric-label">Public management rules</div><div class="metric-value">${config.admin_source_cidrs.length ? '01' : '00'}</div><div class="metric-note"><span class="small-status">${config.admin_source_cidrs.length ? 'RESTRICTED' : 'DISABLED'}</span>${config.admin_source_cidrs.length ? 'Trusted IP ranges only' : 'No internet SSH / RDP'}</div></article></div><div class="content-grid">${panel('Architecture at a glance', 'A small attack surface, with deliberate trust boundaries.', topology() + `<div class="panel-footer"><span>Click a resource to inspect its security boundary.</span><a class="btn link" href="#architecture">Explore architecture ↗</a></div>`, tag(config.location.toUpperCase()))}<div class="stack">${panel('Security controls', 'Configuration intent · not a compliance score', controls(), tag('BY DESIGN', 'green'))}<section class="panel next-action"><div class="eyebrow">NEXT STEP</div><h3>Put the policy to the test.</h3><p>Can an internet client reach the database? Trace the first matching rule.</p><a class="btn link" href="#simulator">Open traffic simulator →</a></section></div></div><div class="lower-grid">${panel('Threat scenarios', 'Model the boundaries before applying infrastructure.', `<div class="scenario-row"><div class="scenario-text">Internet → web · HTTPS<small>Approved sources, TCP 443</small></div>${tag('EXPECTED ALLOW', 'green')}</div><div class="scenario-row"><div class="scenario-text">Internet → private database<small>External source, TCP ${config.database_port}</small></div>${tag('EXPECTED DENY', 'red')}</div><div class="scenario-row"><div class="scenario-text">Web → database · wrong port<small>Lateral movement outside the approved path</small></div>${tag('EXPECTED DENY', 'red')}</div>`)}${panel('Runtime health', 'Measured connectivity, separate from policy intent.', statusRows(), '<a class="btn link" href="#evidence">View evidence ↗</a>')}</div>`
  );
}
function architecture() {
  return (
    heading(
      'ARCHITECTURE EXPLORER',
      'A boundary for every trust decision.',
      'Inspect the network model and understand where each Azure control takes effect.',
      button('Switch deployment profile', 'configure', 'primary'),
    ) +
    modeNotice() +
    panel(
      'Network topology',
      config.enable_workloads ? 'Managed application profile' : 'Baseline network profile',
      topology(),
      tag(config.enable_workloads ? 'APP SERVICE + POSTGRESQL' : 'NETWORK FOUNDATION', 'blue'),
    ) +
    `<div class="three-col section-spacer">${panel('01 / Public entry point', 'Internet-facing surface', `<div class="panel-body prose"><p>${config.enable_workloads ? 'App Service terminates HTTPS and applies IP-based access restrictions. Its integration subnet filters outbound traffic, not public inbound traffic. SCM access is denied by default and basic publishing authentication is disabled.' : 'The web NSG permits configured clients on TCP 80/443. An allocated public IP is unattached until a workload is added. The NSG does not provide TLS or a WAF.'}</p></div>`)}${panel('02 / Private path', 'Web-to-database communication', `<div class="panel-body prose"><p>The web tier can initiate TCP ${config.database_port} to ${escape(config.private_subnet_cidr)}. Every other initiated path is denied, subject to documented platform exceptions. Return packets use NSG stateful connection tracking.</p></div>`)}${panel('03 / Identity boundary', 'Authorization beyond connectivity', `<div class="panel-body prose"><p>${config.enable_workloads ? 'The application uses its system-assigned managed identity to obtain a short-lived PostgreSQL token. Database login is bootstrapped separately by an Entra administrator; the application never receives an admin credential.' : 'Optional Reader assignments are scoped to the resource group. Network reachability does not imply database authorization or permission to read secrets.'}</p></div>`)}</div>` +
    notice(
      'Managed PostgreSQL needs narrowly scoped service traffic for replication, Storage, Entra authentication and DNS. The workload profile includes those exceptions; “deny all” without them would break the service.',
    )
  );
}
function policies() {
  return (
    heading(
      'POLICY INSPECTOR',
      'Read the rules. Understand the outcome.',
      'Lower priority numbers are evaluated first. Explicit deny rules precede Azure’s built-in defaults.',
      button('Test a rule', 'simulator', 'primary'),
    ) +
    `<div class="toolbar"><div class="filters"><label class="sr-only" for="tier-filter">Filter by tier</label><select id="tier-filter"><option value="all">All tiers</option><option value="web">Web subnet</option><option value="database">Database subnet</option></select><label class="sr-only" for="direction-filter">Filter by direction</label><select id="direction-filter"><option value="all">All directions</option><option>Inbound</option><option>Outbound</option></select><span class="tag" id="filtered-count"></span></div><label class="sr-only" for="rule-search">Search rule names</label><input class="search" id="rule-search" placeholder="Search rule names…" maxlength="80"></div><section class="panel table-wrap"><table><thead><tr><th>Priority / rule</th><th>Tier</th><th>Direction</th><th>Source</th><th>Destination</th><th>Ports</th><th>Action</th></tr></thead><tbody id="rules-body"></tbody></table></section><div class="section-spacer">${notice('This table models the custom rules in this project. Service-tag membership and Azure platform behavior require live Azure verification. App Service ingress restrictions are a separate control.')}</div>`
  );
}
function renderRules() {
  const filtered = rules(config).filter(
    (r) =>
      (policyFilters.tier === 'all' || r.tier === policyFilters.tier) &&
      (policyFilters.direction === 'all' || r.direction === policyFilters.direction) &&
      r.name.toLowerCase().includes(policyFilters.query.toLowerCase()),
  );
  $('#rules-body').innerHTML = filtered.length
    ? filtered
        .map(
          (r) =>
            `<tr><td class="rule-name">${r.priority}<small>${escape(r.name)}</small></td><td>${r.tier === 'web' ? 'Web' : 'Database'}</td><td>${r.direction}</td><td><code>${r.sources.map(escape).join('<br>')}</code></td><td><code>${escape(r.destination)}</code></td><td><code>${r.ports.join(', ')}<br>${r.protocol}</code></td><td>${tag(r.access, r.access === 'Allow' ? 'green' : 'red')}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="7" class="empty">No rules match these filters.</td></tr>';
  $('#filtered-count').textContent =
    `${filtered.length} ${filtered.length === 1 ? 'rule' : 'rules'}`;
}
function simulator() {
  return (
    heading(
      'TRAFFIC SIMULATOR',
      'Would this connection get through?',
      'Model a fresh flow against one NSG and trace the decision. No packets are sent.',
      button('Inspect all policies', 'policies'),
    ) +
    notice(
      'Simulation is an educational policy evaluation, not a penetration test or a live Azure connectivity check. Service-tag flows can be indeterminate.',
    ) +
    `<div class="two-col">${panel('Define a traffic flow', 'Choose a preset or enter a source, destination and port.', `<div class="panel-body"><div class="scenario-chips"><button class="chip" data-preset="https">HTTPS ingress</button><button class="chip" data-preset="external-db">External → database</button><button class="chip" data-preset="web-db">Web → database</button><button class="chip" data-preset="ssh">Untrusted SSH</button></div><form id="flow-form"><div class="form-grid"><div class="field"><label for="flow-tier">Target NSG</label><select id="flow-tier" name="tier"><option value="web">Web subnet</option><option value="database">Database subnet</option></select></div><div class="field"><label for="flow-direction">Direction</label><select id="flow-direction" name="direction"><option>Inbound</option><option>Outbound</option></select></div><div class="field"><label for="flow-source">Source IPv4</label><input id="flow-source" name="source" value="203.0.113.10" required maxlength="15"></div><div class="field"><label for="flow-destination">Destination IPv4</label><input id="flow-destination" name="destination" value="${subnetHost(config.public_subnet_cidr)}" required maxlength="15"></div><div class="field"><label for="flow-protocol">Protocol</label><select id="flow-protocol" name="protocol"><option>Tcp</option><option>Udp</option></select></div><div class="field"><label for="flow-port">Destination port</label><input id="flow-port" name="port" type="number" min="1" max="65535" value="443" required></div></div><div class="form-actions"><button class="btn primary" type="submit">⇄ Evaluate flow</button>${button('↓ Export result', 'export-simulation')}</div><div id="flow-error" class="error" role="alert"></div></form></div>`)}${panel('Decision trace', 'First match wins · evaluated in priority order', `<div class="panel-body" id="simulation-result">${simulation ? simulationHtml() : '<div class="empty"><span class="empty-icon">⇄</span>Your next security decision starts here.<br>Define a flow and evaluate its path.</div>'}</div>`, tag('OFFLINE MODEL', 'blue'))}</div>`
  );
}
function simulationHtml() {
  const { result, flow } = simulation;
  return `<div class="result ${result.decision === 'Deny' ? 'deny' : result.decision === 'Indeterminate' ? 'indeterminate' : ''}"><div class="result-label">MODELED OUTCOME</div><div class="result-decision">${result.decision === 'Allow' ? 'Connection allowed' : result.decision === 'Deny' ? 'Connection denied' : 'Needs Azure verification'}</div><p>${escape(result.explanation)}</p></div><div class="eyebrow">EVALUATION TRACE</div>${result.trace.map((r) => `<div class="trace-row"><span><strong>${r.priority}</strong> · ${escape(r.name)}</span>${tag(r.matched === null ? 'Unknown' : r.matched ? 'Matched' : 'Skipped', r.matched ? 'green' : '')}</div>`).join('')}<p class="prose section-spacer"><code>${escape(flow.source)} → ${escape(flow.destination)}:${flow.port}</code><br>${flow.direction} · ${flow.tier} NSG · ${flow.protocol}</p>`;
}
function configure() {
  return (
    heading(
      'DEPLOYMENT STUDIO',
      'Design locally. Deploy deliberately.',
      'Validate your network configuration and export reviewable Terraform inputs.',
      button('Reset to runtime config', 'reset-config'),
    ) +
    notice(
      'The studio does not run Terraform or connect to your Azure account. Exports contain no credentials. Apply a reviewed plan from your terminal or protected CI environment.',
    ) +
    `<div class="two-col">${panel('Infrastructure configuration', 'Changes update the local policy model after validation.', `<div class="panel-body"><form id="config-form"><div class="form-grid">${field('Project name', 'project_name', config.project_name)}<div class="field"><label for="environment">Environment</label><select id="environment" name="environment">${['development', 'staging', 'production'].map((v) => `<option ${config.environment === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>${field('Azure region', 'location', config.location)}${field('VNet address space', 'vnet_cidr', config.vnet_cidr)}${field('Web subnet CIDR', 'public_subnet_cidr', config.public_subnet_cidr)}${field('Database subnet CIDR', 'private_subnet_cidr', config.private_subnet_cidr)}${field('Database TCP port', 'database_port', config.database_port, 'number')}<div class="field"><label for="admin_port">Management protocol</label><select id="admin_port" name="admin_port"><option value="22" ${config.admin_port === 22 ? 'selected' : ''}>SSH · 22</option><option value="3389" ${config.admin_port === 3389 ? 'selected' : ''}>RDP · 3389</option></select></div><div class="field full"><label for="web_source_cidrs">Web client CIDRs</label><textarea id="web_source_cidrs" name="web_source_cidrs">${config.web_source_cidrs.map(escape).join('\n')}</textarea><small>One CIDR per line. 0.0.0.0/0 deliberately permits public web clients.</small></div><div class="field full"><label for="admin_source_cidrs">Trusted administrator CIDRs</label><textarea id="admin_source_cidrs" name="admin_source_cidrs" placeholder="Empty = no management ingress">${config.admin_source_cidrs.map(escape).join('\n')}</textarea><small>Use /32 where possible. Leave empty for App Service workloads.</small></div><label class="checkbox-field field full"><input name="enable_workloads" type="checkbox" ${config.enable_workloads ? 'checked' : ''}>Enable managed web + PostgreSQL workload profile</label></div><div class="form-actions"><button class="btn primary" type="submit">Validate & update model</button>${button('↓ Download tfvars', 'export')}</div><div id="config-error" class="error" role="alert"></div></form></div>`)}<div class="stack">${panel('Configuration preview', 'Generated inputs · fill subscription and Entra admin separately', `<div class="panel-body"><pre class="config-preview" id="config-preview">${escape(tfvars(config))}</pre></div>`, tag('terraform.tfvars'))}${panel('Deployment workflow', 'Keep cloud changes outside the public GUI.', `<div class="panel-body"><div class="step"><span class="step-num">1</span><div><strong>Review your inputs</strong><p>Set your subscription, region, unique name suffix and Entra administrator for workloads.</p></div></div><div class="step"><span class="step-num">2</span><div><strong>Plan before apply</strong><p><code>terraform init<br>terraform plan -out=deployment.tfplan</code></p></div></div><div class="step"><span class="step-num">3</span><div><strong>Deploy code and bootstrap DB login</strong><p>Package the app, deploy through Azure CLI, and run the least-privilege database bootstrap from the web app console.</p></div></div><a class="btn link" href="#guide">Read the deployment guide →</a></div>`)}</div></div>`
  );
}
function field(label, name, value, type = 'text') {
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" value="${escape(value)}" type="${type}" required ${type === 'number' ? 'min="1" max="65535"' : 'maxlength="64"'}></div>`;
}
function evidence() {
  return (
    heading(
      'EVIDENCE & OBSERVABILITY',
      'Show what you actually verified.',
      'Keep observed runtime health separate from infrastructure design and manual acceptance.',
      button('↻ Refresh health', 'refresh') +
        button('↓ Export evidence', 'export-evidence', 'primary'),
    ) +
    modeNotice() +
    `<div class="three-col">${panel('Application', 'HTTP server observation', `<div class="panel-body"><div class="evidence-status">${status ? 'OBSERVED' : 'CHECKING'}</div><div class="health-big">${status ? 'Running' : 'Waiting'}</div><p class="prose">${status ? `Last observed: ${escape(new Date(status.observed_at).toLocaleString())}` : 'Waiting for a server response.'}</p></div>`)}${panel('Database', 'Authenticated connection · SELECT 1', `<div class="panel-body"><div class="evidence-status">${status?.database.state === 'connected' ? 'OBSERVED' : 'NOT VERIFIED'}</div><div class="health-big">${status?.database.state === 'connected' ? 'Connected' : status?.database.state === 'unavailable' ? 'Unavailable' : 'Not configured'}</div><p class="prose">${status?.database.state === 'connected' ? `${status.database.latency_ms} ms · ${escape(status.database.authentication)} · ${status.database.tls ? 'verified TLS' : 'local network, no TLS'}` : 'Start the Compose profile or complete Azure database identity bootstrap.'}</p></div>`)}${panel('Azure security controls', 'NSG, RBAC and public exposure', `<div class="panel-body"><div class="evidence-status">MANUAL EVIDENCE REQUIRED</div><div class="health-big">Not scanned</div><p class="prose">The application does not have Azure Reader access and does not claim to audit your subscription.</p></div>`)}</div><div class="two-col section-spacer">${panel('Acceptance checklist', 'Self-attested browser checklist · not an automated test', `<div class="panel-body checklist" id="acceptance-list">${['Reviewed Terraform plan and cost implications', 'Confirmed HTTPS redirect and untrusted ingress rejection', 'Confirmed private database endpoint and absence of public access', 'Verified web-to-database access and rejected other paths', 'Verified managed identity has CONNECT only, no admin membership', 'Captured effective NSG rules and Network Watcher results', 'Tested backup restoration and documented incident response'].map((text, i) => `<label><input type="checkbox" data-check="${i}"><span>${text}</span></label>`).join('')}<p class="prose">Checked items are self-reported and stay in this browser. Exported reports identify their source.</p></div>`)}${panel('Evidence provenance', 'A professional portfolio distinguishes claims from proof.', `<div class="panel-body prose"><h3>Configuration model</h3><p>Terraform inputs and simulated policy decisions describe intended behavior. They do not prove deployed controls.</p><h3>Runtime observation</h3><p>The app reports a timestamped HTTP observation and an authenticated database connection check. No sensitive connection details are exported.</p><h3>Azure acceptance</h3><p>Collect sanitized effective rules, identity grants, and live connectivity results in <code>docs/evidence/</code>. Never include state, access tokens, or credentials.</p></div>`)}</div>`
  );
}
function guide() {
  return (
    heading(
      'ENGINEERING FIELD GUIDE',
      'A portfolio with engineering substance.',
      'Architecture, operations, and honest security claims — all in a reproducible repository.',
    ) +
    `<div class="two-col">${panel('Run locally', 'Node.js 22+ · no Azure account required', `<div class="panel-body prose"><p>Use the browser workbench immediately in demo mode:</p><pre><code>npm ci\nnpm test\nnpm start\n# http://localhost:3000</code></pre><p>For a real local PostgreSQL connection, start Docker Desktop and use the isolated Compose stack:</p><pre><code>npm run setup:local\ndocker compose up --build\n# http://localhost:3000</code></pre><p>The database has no host port. A dedicated, non-superuser application login performs health queries. Local database TLS is intentionally disabled; the Azure profile verifies TLS.</p></div>`)}${panel('Deploy to Azure', 'Paid services · reviewed Terraform plan required', `<div class="panel-body prose"><ol><li>Authenticate with Azure CLI and register required resource providers.</li><li>Copy the example tfvars; supply your subscription and Entra admin values.</li><li>Enable workloads and select a globally unique deployment suffix.</li><li>Review and apply the Terraform plan.</li><li>Run <code>npm run package:azure</code>, temporarily allow your IP on SCM, and deploy the zip with Azure CLI.</li><li>From the app SSH console, run the database bootstrap with a short-lived administrator token.</li><li>Remove the SCM allowance and confirm runtime health.</li></ol><p>Full commands, prerequisites and recovery steps are in <code>docs/DEPLOYMENT.md</code>. This GUI never runs cloud commands.</p></div>`)}</div><div class="three-col section-spacer">${panel('Segmentation', 'Contain lateral movement', `<div class="panel-body prose"><p>Dedicated subnets and explicit deny rules reduce network exposure. A compromised web host retains access to the allowed database port; database authorization is a separate boundary.</p></div>`)}${panel('Least privilege', 'Separate operator and runtime roles', `<div class="panel-body prose"><p>The deployer creates infrastructure. Reader users inspect resources. An Entra admin creates a CONNECT-only PostgreSQL role for the web app identity. Runtime code has no admin secret.</p></div>`)}${panel('Reproducibility', 'Code, tests and review', `<div class="panel-body prose"><p>Shared policy logic is covered by boundary tests. API tests verify validation, error handling and security headers. CI validates Terraform and scans dependencies. Live Azure evidence remains an explicit acceptance step.</p></div>`)}</div><div class="section-spacer">${panel('Primary technical references', 'Official sources for the architecture decisions', `<div class="panel-body prose"><ul><li><a href="https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview" target="_blank" rel="noopener noreferrer">Azure NSGs and stateful filtering</a></li><li><a href="https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration" target="_blank" rel="noopener noreferrer">App Service VNet integration: outbound, not ingress</a></li><li><a href="https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private" target="_blank" rel="noopener noreferrer">PostgreSQL private networking and required service flows</a></li><li><a href="https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity" target="_blank" rel="noopener noreferrer">Managed identity database authentication</a></li></ul></div>`)}</div>`
  );
}

function render() {
  const hash = location.hash.slice(1);
  currentView = labels[hash] ? hash : 'overview';
  $('#breadcrumb').textContent = labels[currentView];
  for (const a of document.querySelectorAll('nav a')) {
    a.classList.toggle('active', a.dataset.view === currentView);
    if (a.dataset.view === currentView) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  $('#rule-count').textContent = rules(config).length;
  $('#env-badge').textContent = config.environment;
  $('#mode-badge').textContent =
    mode === 'azure' ? 'AZURE RUNTIME' : mode === 'local' ? 'LOCAL DATABASE' : 'LOCAL DEMO';
  $('#view').innerHTML = {
    overview,
    architecture,
    policies,
    simulator,
    configure,
    evidence,
    guide,
  }[currentView]();
  if (currentView === 'policies') {
    $('#tier-filter').value = policyFilters.tier;
    $('#direction-filter').value = policyFilters.direction;
    $('#rule-search').value = policyFilters.query;
    renderRules();
  }
  if (currentView === 'simulator' && simulation)
    for (const [key, value] of Object.entries(simulation.flow))
      $('#flow-form').elements[key].value = value;
  if (currentView === 'evidence') restoreChecklist();
}
function preset(key) {
  const form = $('#flow-form');
  const presets = {
    https: {
      tier: 'web',
      source: '203.0.113.10',
      destination: subnetHost(config.public_subnet_cidr),
      port: 443,
    },
    'external-db': {
      tier: 'database',
      source: '203.0.113.10',
      destination: subnetHost(config.private_subnet_cidr),
      port: config.database_port,
    },
    'web-db': {
      tier: 'database',
      source: subnetHost(config.public_subnet_cidr),
      destination: subnetHost(config.private_subnet_cidr),
      port: config.database_port,
    },
    ssh: {
      tier: 'web',
      source: '203.0.113.10',
      destination: subnetHost(config.public_subnet_cidr),
      port: 22,
    },
  };
  for (const [k, v] of Object.entries({ ...presets[key], direction: 'Inbound', protocol: 'Tcp' }))
    form.elements[k].value = v;
}
function showNode(key) {
  const w = config.enable_workloads;
  const details = {
    web: {
      title: w ? 'Web integration subnet' : 'Public / DMZ subnet',
      cidr: config.public_subnet_cidr,
      description: w
        ? 'App Service uses virtual interfaces in this delegated subnet for outbound database connections. Public web ingress is enforced by App Service access restrictions, not this NSG.'
        : 'This subnet hosts future web workloads. Client HTTP/HTTPS ingress is allowed, while management requires explicitly trusted CIDRs.',
      boundary:
        'Initiated outbound database traffic only, plus documented service exceptions in workload mode.',
    },
    database: {
      title: 'Private database subnet',
      cidr: config.private_subnet_cidr,
      description: w
        ? 'PostgreSQL Flexible Server is injected into a delegated subnet with public network access disabled. Private DNS resolves its service hostname.'
        : 'The private tier accepts only the configured database port from the web CIDR. No database or workload is provisioned in baseline mode.',
      boundary: `TCP ${config.database_port} from the web subnet; all other custom-rule ingress denied, with required internal PostgreSQL service flows in workload mode.`,
    },
    ingress: {
      title: 'Azure App Service',
      cidr: 'Managed public HTTPS endpoint',
      description:
        'A managed Linux Node.js application with TLS 1.2 minimum, HTTP-to-HTTPS enforcement and system-assigned identity.',
      boundary:
        'IP restrictions filter client access. SCM ingress is denied by default. Public SSH/RDP is not exposed.',
    },
  }[key];
  $('#node-detail').innerHTML =
    `<div class="eyebrow">RESOURCE BOUNDARY</div><h2>${details.title}</h2>${tag(details.cidr, 'blue')}<p>${details.description}</p><dl><dt>Security boundary</dt><dd>${details.boundary}</dd><dt>Evidence</dt><dd>Configuration intent. Inspect the live Azure resource before claiming enforcement.</dd></dl>`;
  $('#node-dialog').showModal();
}
async function refresh() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error();
    status = await response.json();
    if (['overview', 'evidence'].includes(currentView)) render();
  } catch {
    toast('Health check unavailable. Confirm the app server is running.');
  }
}
function checklist() {
  return [...document.querySelectorAll('[data-check]')]
    .filter((e) => e.checked)
    .map((e) => ({
      item: e.parentElement.textContent.trim(),
      source: 'self_attested_browser_checklist',
    }));
}
function restoreChecklist() {
  try {
    const checked = JSON.parse(localStorage.getItem('sentinel-checklist') || '[]');
    for (const e of document.querySelectorAll('[data-check]'))
      e.checked = checked.includes(e.dataset.check);
  } catch {}
}

function updateConfig(form) {
  const f = new FormData(form);
  const input = Object.fromEntries(f);
  input.database_port = Number(input.database_port);
  input.admin_port = Number(input.admin_port);
  input.enable_workloads = f.has('enable_workloads');
  for (const key of ['web_source_cidrs', 'admin_source_cidrs'])
    input[key] = input[key]
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  config = validateConfig(input);
  simulation = null;
  $('#config-preview').textContent = tfvars(config);
  $('#config-error').textContent = '';
  $('#env-badge').textContent = config.environment;
  $('#rule-count').textContent = rules(config).length;
}

document.addEventListener('click', async (e) => {
  const node = e.target.closest('[data-node]');
  if (node) return showNode(node.dataset.node);
  const chip = e.target.closest('[data-preset]');
  if (chip) return preset(chip.dataset.preset);
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (labels[action]) location.hash = action;
  else if (action === 'export') {
    try {
      if ($('#config-form')) updateConfig($('#config-form'));
      download('terraform.tfvars', tfvars(config), 'text/plain');
      toast('Configuration exported. Set your Azure IDs before applying.');
    } catch (error) {
      if ($('#config-error')) $('#config-error').textContent = error.message;
      toast(error.message);
    }
  } else if (action === 'reset-config') {
    config = { ...runtime };
    simulation = null;
    render();
    toast('Model restored to server configuration.');
  } else if (action === 'refresh') {
    target.disabled = true;
    await refresh();
    toast('Runtime health refreshed.');
    target.disabled = false;
  } else if (action === 'export-simulation') {
    if (!simulation) return toast('Evaluate a flow first.');
    download(
      'policy-simulation.json',
      JSON.stringify(
        { source: 'offline_model', generated_at: new Date().toISOString(), config, ...simulation },
        null,
        2,
      ),
    );
    toast('Simulation exported with provenance.');
  } else if (action === 'export-evidence') {
    await refresh();
    download(
      'security-evidence.json',
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          runtime_observation: status,
          configuration_model: config,
          azure_controls_verified: false,
          manual_acceptance: checklist(),
          last_simulation: simulation,
        },
        null,
        2,
      ),
    );
    toast('Evidence exported. Manual checklist items are self-attested.');
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'flow-form') {
    e.preventDefault();
    const f = new FormData(e.target);
    const flow = Object.fromEntries(f);
    flow.port = Number(flow.port);
    try {
      simulation = { flow, result: evaluate(config, flow), source: 'offline_model' };
      $('#simulation-result').innerHTML = simulationHtml();
      $('#flow-error').textContent = '';
    } catch (error) {
      $('#flow-error').textContent = error.message;
    }
  }
  if (e.target.id === 'config-form') {
    e.preventDefault();
    try {
      updateConfig(e.target);
      toast('Configuration validated. The local model is updated.');
    } catch (error) {
      $('#config-error').textContent = error.message;
    }
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'rule-search') {
    policyFilters.query = e.target.value;
    renderRules();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'tier-filter' || e.target.id === 'direction-filter') {
    policyFilters[e.target.id === 'tier-filter' ? 'tier' : 'direction'] = e.target.value;
    renderRules();
  }
  if (e.target.matches('[data-check]')) {
    try {
      localStorage.setItem(
        'sentinel-checklist',
        JSON.stringify(
          [...document.querySelectorAll('[data-check]')]
            .filter((c) => c.checked)
            .map((c) => c.dataset.check),
        ),
      );
    } catch {
      toast('Browser storage is unavailable; checklist will not persist.');
    }
  }
});
$('.dialog-close').addEventListener('click', () => $('#node-dialog').close());
$('#node-dialog').addEventListener('click', (e) => {
  if (e.target === $('#node-dialog')) $('#node-dialog').close();
});
$('#guide-button').addEventListener('click', () => (location.hash = 'guide'));
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
$('#view').innerHTML = '<div class="loading">Preparing your security workbench…</div>';
try {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error();
  const payload = await response.json();
  runtime = validateConfig(payload.config);
  config = { ...runtime };
  mode = payload.mode;
} catch {
  toast('Server configuration unavailable. Showing the default offline model.');
}
render();
await refresh();
