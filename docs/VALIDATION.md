# Validation record

Prepared on 2026-10-13. These results describe this local workspace, not a live Azure security audit.

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
| Local Docker integration                | Attempted, not completed            | Installed engine started, but image pull stalled and registry lookup failed; live stack remains unverified                                            |
| GitHub workflow execution / IaC scan    | Not executed here                   | Workflows prepared; remote run and report review required after pushing                                                                               |
| Live Azure apply / acceptance / restore | Not executed                        | Azure account inputs and live deployment evidence required                                                                                            |

The simulator is not a live traffic probe. The DB health query proves an authenticated connection only, not full resource compliance. Re-run checks after any change; update this record with actual results and artifact/source references.
