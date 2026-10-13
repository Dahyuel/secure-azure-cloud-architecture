# Architecture and security boundaries

The browser explains policies and exports configuration. Node.js serves an allowlisted GUI, validates simulation/export requests and reports a fixed DB connectivity check. Terraform provisions resources. An operator reviews plans, deploys source and bootstraps the runtime database role.

## Deployment profiles

Baseline mode retains the original VM-oriented DMZ model: web HTTP/HTTPS ingress, optional one-protocol management from trusted CIDRs, private DB ingress from the web tier and explicit denies. It deploys no VM.

Workload mode delegates web integration to `Microsoft.Web/serverFarms` and the private subnet to `Microsoft.DBforPostgreSQL/flexibleServers`. App Service runs on a managed worker; its outbound integration carries private DB traffic. Public inbound requests are filtered by App Service access restrictions and HTTPS settings, not the integration NSG.

Both subnets disable implicit outbound access. Workloads add explicit NAT and required service exceptions. PostgreSQL has no public endpoint, password authentication or internet firewall allow rule. The NAT IP is an outbound translation address, not a DB NIC address.

## Boundaries

| Boundary                 | Enforcement                                                     | Residual risk                                                |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| Internet → app           | HTTPS/TLS, source CIDRs, input validation, CSP/security headers | Public metadata remains visible; no WAF or user accounts     |
| App → DB                 | Private DNS, web CIDR, TCP 5432, verified TLS, managed identity | Compromised app retains the permitted private path           |
| Operator → DB            | Existing Entra administrator via private operator path          | Bootstrap token is privileged                                |
| Runtime DB role          | CONNECT only, no tables/admin memberships                       | Read-only session defaults are not an authorization boundary |
| Reviewer → Azure         | Reader at dedicated resource-group scope                        | Metadata remains visible                                     |
| Deployer → control plane | Separate CLI/OIDC identity and reviewed scope                   | Initial group/RBAC creation requires additional privileges   |

## NSG semantics and simulation limits

Denies at priority 4096 override Azure's default VNet/load-balancer allows. NSGs track connections; replies need no reverse allow. Established connections can survive rule changes.

Workloads add internal DB 5432, regional Storage HTTPS, Entra HTTPS and Azure DNS TCP/UDP 53. The DB subnet is dedicated to PostgreSQL. Platform traffic can have special handling that offline models do not reproduce.

The simulator evaluates one NSG and a fresh IPv4 flow. It does not compose NIC/subnet policies, routing, ingress restrictions, NAT, listeners, connection state, RBAC or database grants. Service-tag membership is not resolved; relevant flows are indeterminate. A modeled Allow is not proof of reachability.

## Runtime

No arbitrary SQL, shell command or target host is accepted. Azure tokens are fetched from the provided App Service identity endpoint and used over verified PostgreSQL TLS. Health results cache for 15 seconds; queries/connections have timeouts. JSON requests are bounded, and API requests have a socket-peer in-memory limit. Behind Azure's proxy this can be shared; production client quotas belong at a gateway/distributed limiter.

The public API exposes configured CIDRs, region, project and generic health. It omits subscription IDs, admin names, DB hostname, tokens and raw errors. Restrict ingress or add Entra auth if the architectural metadata is nonpublic. No synthetic security event is presented as an incident.

Run-from-package makes deployed application files read-only. The allowlisted ZIP includes dependencies so runtime npm access is unnecessary. Future native dependencies need a Linux build artifact.

References: [NSGs](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview), [App Service VNet integration](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration), [PostgreSQL private networking](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private), [managed identity](https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity).
