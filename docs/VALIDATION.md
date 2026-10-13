# Validation record

Prepared on 2026-10-13 and updated after GitHub CI. These results describe local checks and a GitHub-hosted container integration test, not a live Azure security audit.

| Check                                   | Result                              | Scope                                                                                                                                                 |
| --------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript syntax                       | Passed                              | Application, scripts and test modules                                                                                                                 |
| Node test suite                         | 16 passed                           | IPv4/CIDR boundaries, NSG behavior, configuration validation, API errors/headers, DB mode handling, managed identity token audience and ZIP structure |
| npm dependency audit                    | Zero known vulnerabilities reported | Installed runtime dependencies at the time of preparation                                                                                             |
| Azure application package               | Created                             | Allowlisted ZIP with dependency tree, no credential/Terraform files                                                                                   |
| Terraform format                        | Passed                              | Root IaC and test files                                                                                                                               |
| Terraform validation                    | Passed                              | Terraform 1.13.5, AzureRM 4.81.0 schema                                                                                                               |
| Terraform mock tests                    | 7 passed                            | Default denies, trusted management, input rejection, workload security and subnet bounds                                                              |
| Browser interaction                     | Passed for recorded flows           | External DB denial, permitted private path, overlapping CIDR rejection and workload model update                                                      |
| Local Docker integration                | Attempted, not completed            | Installed engine started, but image pull stalled and registry lookup failed; local live stack remains unverified; GitHub integration passed           |
| GitHub workflow execution / IaC scan    | Passed; finding documented          | Real container/DB role checks passed; one intentional public web ingress finding documented                                                           |
| Live Azure apply / acceptance / restore | Not executed                        | Azure account inputs and live deployment evidence required                                                                                            |

## GitHub publication evidence

Source commit: `15f028ac1979bebd984132b643c1c7ec9320a236`.

- [Application, infrastructure and container verification](https://github.com/Dahyuel/secure-azure-cloud-architecture/actions/runs/38431066325): passed. The container job confirmed a real authenticated PostgreSQL connection, no published database host port, and a non-admin runtime role without database TEMP or schema CREATE privileges.
- [Dependency, secret and infrastructure review](https://github.com/Dahyuel/secure-azure-cloud-architecture/actions/runs/38431066336): passed configured gates and produced an IaC report. The report contains one critical-severity finding for intentional public web ingress; see [its documented disposition](SECURITY_REVIEW.md).
- The local Docker attempt still did not complete; the successful container observation came from GitHub's Linux runner, not the local machine.

The simulator is not a live traffic probe. The DB health query proves an authenticated connection only, not full resource compliance. Re-run checks after any change; update this record with actual results and artifact/source references.
