# Threat model

Assets: Azure state/control plane, code/dependencies, identity tokens, private database, operator bootstrap token, architectural metadata and acceptance evidence. Assumptions: authorized deployer, controlled Entra tenant, reviewed code, dedicated resource group/subnets, and no unrelated DB-subnet workloads. Compose is a local learning environment.

| Threat                            | Control                                                                 | Verification                                            | Residual risk                                                 |
| --------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| Internet DB probing               | No public endpoint, private delegation and NSG source/port restrictions | Inspect server networking and fresh external connection | Privileged operators can alter exposure                       |
| Web compromise / lateral movement | Approved DB port only; runtime CONNECT-only identity                    | Effective rules and DB privilege inspection             | App retains its allowed path/token                            |
| Broad management                  | Empty admin defaults; trusted CIDR validation; closed SCM               | Plan review and untrusted-source test                   | Temporary allowances can be forgotten                         |
| Secret disclosure                 | Managed identity, Entra-only DB, no runtime admin credential            | Sanitized state/settings review                         | Operator token and local `.env` require protection            |
| Command / configuration injection | Validated allowlist, no GUI shell executor, fixed SQL                   | API tests including HCL strings and path traversal      | Deployment-owned env remains trusted                          |
| XSS / clickjacking                | Output escaping, CSP, external scripts, frame denial                    | Header/browser checks                                   | Future unsafe rendering can regress controls                  |
| Resource exhaustion               | Bounded JSON, timeouts, health cache, in-process limit                  | Tests and later load testing                            | Not a distributed DDoS control                                |
| Supply-chain tampering            | Locks, dependency/secret scans, review/update PRs                       | Audit/source review                                     | Actions/images need immutable release pins and ongoing review |
| False compliance evidence         | Simulation/provenance labels, no fabricated events/scores               | Inspect exported evidence                               | Self-attestation still needs review                           |
| Data loss / outages               | Backup retention, optional HA, diagnostics/CPU alert                    | Restore drill                                           | Default lab lacks HA; no alert notifications configured       |

No WAF, dedicated DDoS plan, Azure inventory audit, user account system, sensitive business-data storage, arbitrary CRUD, VPN or multi-region recovery is claimed. Hosting private evidence requires additional authentication/authorization.

Research extensions: compare VM and managed ingress tests, evaluate service-tag uncertainty, add read-only Azure drift detection, compare private management with temporary SCM, and measure restoration time. Record hypotheses and measured results instead of inventing security scores.
