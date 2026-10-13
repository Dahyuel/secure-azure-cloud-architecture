# Live Azure acceptance record

Copy after a real deployment; do not mark unmeasured checks passed. Sanitize identity/subscription IDs, operator IPs, confidential logs and hostnames. Never publish state/tokens/credentials.

- Date / UTC time:
- Source commit / artifact SHA-256:
- Terraform/provider versions / profile / region / SKUs:
- Authorized tester / evidence collection method:

| Check                 | Expected                                        | Observed / evidence | Outcome    |
| --------------------- | ----------------------------------------------- | ------------------- | ---------- |
| HTTP app request      | Redirect to HTTPS                               |                     | Not tested |
| Unapproved app source | Access restriction rejection                    |                     | Not tested |
| SCM after deploy      | Denied                                          |                     | Not tested |
| External DB           | No public reachability                          |                     | Not tested |
| App → DB              | Managed identity SELECT 1 / verified TLS        |                     | Not tested |
| Other private ports   | Denied                                          |                     | Not tested |
| Runtime DB privileges | CONNECT only, no elevated/table grants          |                     | Not tested |
| NSG defaults          | Explicit deny 4096 overrides default VNet allow |                     | Not tested |
| Egress                | Approved DB/platform flows only                 |                     | Not tested |
| Reader                | Resource-group read only                        |                     | Not tested |
| Diagnostics           | App/DB observations in workspace                |                     | Not tested |
| Restore drill         | Isolated recovery measured                      |                     | Not tested |

Identify observed, simulated, self-attested and untested claims. Use fresh connections after rule changes. Record accepted scanner findings, platform exceptions, recovery time/data age, remediation and unresolved work.
