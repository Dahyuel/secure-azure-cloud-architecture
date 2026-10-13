output "resource_group_name" {
  description = "Resource group containing the network foundation."
  value       = azurerm_resource_group.this.name
}

output "virtual_network_id" {
  description = "VNet resource ID for workload integration."
  value       = azurerm_virtual_network.this.id
}

output "subnet_ids" {
  description = "Subnet IDs, ready after their NSG associations are established."
  value = {
    public  = azurerm_subnet_network_security_group_association.public.subnet_id
    private = azurerm_subnet_network_security_group_association.private.subnet_id
  }
}

output "network_security_group_ids" {
  description = "NSG IDs for inspection and monitoring integration."
  value = {
    public  = azurerm_network_security_group.public.id
    private = azurerm_network_security_group.private.id
  }
}

output "public_ip_allocations" {
  description = "Public IP allocations: optional unattached baseline web IP and workload NAT egress IP. App Service ingress has a managed hostname."
  value = merge(
    { for pip in azurerm_public_ip.web : pip.name => { id = pip.id, address = pip.ip_address, purpose = "unattached-web" } },
    { for pip in azurerm_public_ip.egress : pip.name => { id = pip.id, address = pip.ip_address, purpose = "outbound-nat-only" } }
  )
}

output "reader_role_assignment_ids" {
  description = "Resource-group Reader assignments created for supplied principals."
  value       = { for principal, assignment in azurerm_role_assignment.reader : principal => assignment.id }
}

output "application_url" {
  description = "Managed HTTPS endpoint; deploy the application ZIP after Terraform apply. Null in network-only mode."
  value       = var.enable_workloads ? "https://${azurerm_linux_web_app.this[0].default_hostname}" : null
}

output "application_name" {
  description = "App Service name for code deployment and operator console access."
  value       = var.enable_workloads ? azurerm_linux_web_app.this[0].name : null
}

output "application_principal_id" {
  description = "Runtime managed identity object ID used in the separate least-privilege database bootstrap."
  value       = var.enable_workloads ? azurerm_linux_web_app.this[0].identity[0].principal_id : null
}

output "postgres_hostname" {
  description = "Private DNS hostname; resolves/reaches from the integrated VNet only."
  value       = var.enable_workloads ? azurerm_postgresql_flexible_server.this[0].fqdn : null
}

output "log_analytics_workspace_id" {
  description = "Workspace for centralized Azure diagnostic logs."
  value       = var.enable_workloads ? azurerm_log_analytics_workspace.this[0].id : null
}
