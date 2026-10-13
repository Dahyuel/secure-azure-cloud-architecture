# Scanner findings and release review

Dependency/secret jobs gate configured high/critical findings. IaC scanning creates a JSON report with `exit-code: 0`; it is not a clean compliance gate. Review every finding with tool/version, rule ID, resource, severity, disposition, rationale, owner and date. Do not silently blanket-ignore findings.

Expected design questions: deliberate public web ingress, unattached baseline IPs, lab availability, optional geo backup, monitoring quota and platform exceptions. Public web ports are intentional; internet management is not. App Service redirects HTTP to HTTPS; an NSG cannot redirect.

Workflow actions are pinned to full commit SHAs resolved from upstream release tags and tracked by Dependabot. Container tags are updated through reviewed PRs; pin tested images to immutable digests before a security-sensitive release. Do not auto-merge updates. npm/provider lock files pin resolved dependencies/checksums.

Compose app controls: non-root, dropped capabilities, read-only filesystem, no-new-privileges, process/memory limits and loopback ingress. PostgreSQL has no published host port. Container scanning and integration checks require an active Linux engine.
