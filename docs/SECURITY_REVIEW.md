# Scanner findings and release review

Dependency/secret jobs gate configured high/critical findings. IaC scanning creates a JSON report with `exit-code: 0`; it is not a clean compliance gate. Review every finding with tool/version, rule ID, resource, severity, disposition, rationale, owner and date. Do not silently blanket-ignore findings.

Expected design questions: deliberate public web ingress, unattached baseline IPs, lab availability, optional geo backup, monitoring quota and platform exceptions. Public web ports are intentional; internet management is not. App Service redirects HTTP to HTTPS; an NSG cannot redirect.

Workflow actions are pinned to full commit SHAs resolved from upstream release tags and tracked by Dependabot. Container tags are updated through reviewed PRs; pin tested images to immutable digests before a security-sensitive release. Do not auto-merge updates. npm/provider lock files pin resolved dependencies/checksums.

Compose app controls: non-root, dropped capabilities, read-only filesystem, no-new-privileges, process/memory limits and loopback ingress. PostgreSQL has no published host port. Container scanning and integration checks require an active Linux engine.

## Publication finding disposition — 2026-10-13

The [initial GitHub IaC report](https://github.com/Dahyuel/secure-azure-cloud-architecture/actions/runs/38431066336) contains one finding from the pinned Trivy action 0.35.0:

| Rule     | Severity | Resource                                      | Disposition                                                             |
| -------- | -------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| AZU-0047 | Critical | `azurerm_network_security_rule.public["web"]` | Documented intentional public web ingress in the reference architecture |

The default client CIDR `0.0.0.0/0` permits TCP 80/443 to the web subnet because this is a public web-tier example. This is a real exposure decision, not a scanner false positive. The rule does not permit arbitrary ports, database ingress or public management. Explicit denies override VNet defaults; management remains disabled unless restricted sources are supplied. The deployed managed app separately enforces HTTPS and IP restrictions at App Service ingress.

For a restricted audience, set `web_source_cidrs` to approved networks. Baseline VM workloads still require their own TLS/HTTP redirect configuration. This disposition applies to the documented public-data portfolio lab; it is not an approval for hosting private data or a blanket production exception. Review again if ingress ports, audience, workload sensitivity or the architecture changes. No global suppression was added, and the raw report remains available as a workflow artifact.
