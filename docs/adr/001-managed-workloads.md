# ADR 001: Managed workload profile

Status: accepted.

Context: deploy a real GUI/backend/private database without requiring hand-managed VM patching, certificate bootstrap and images.

Decision: Linux App Service plus private PostgreSQL, with a separate baseline VM-network profile. Explain ingress access restrictions independently of outbound VNet NSGs. NAT provides explicit egress, not DB public ingress.

Consequences: managed TLS/runtime and clear identity boundaries; two delegations, platform exceptions, paid dependencies, regional capacity constraints and a separate operator DB bootstrap. No public SSH/RDP for the deployed workload.

Alternatives: hardened VMs/baked images, Container Apps, or private App Service behind WAF ingress. These are extensions rather than partially implemented claims.
