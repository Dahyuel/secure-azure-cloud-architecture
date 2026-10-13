# Mock provider tests check planned security invariants without Azure credentials.
mock_provider "azurerm" {
  mock_data "azurerm_client_config" {
    defaults = {
      tenant_id       = "22222222-2222-2222-2222-222222222222"
      subscription_id = "00000000-0000-0000-0000-000000000000"
      object_id       = "33333333-3333-3333-3333-333333333333"
    }
  }
  mock_resource "azurerm_service_plan" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/lab/providers/Microsoft.Web/serverFarms/lab" }
  }
  mock_resource "azurerm_linux_web_app" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/lab/providers/Microsoft.Web/sites/lab" }
  }
  mock_resource "azurerm_postgresql_flexible_server" {
    defaults = {
      id   = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/lab/providers/Microsoft.DBforPostgreSQL/flexibleServers/lab"
      fqdn = "lab.postgres.database.azure.com"
    }
  }
  mock_resource "azurerm_log_analytics_workspace" {
    defaults = { id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/lab/providers/Microsoft.OperationalInsights/workspaces/lab" }
  }
}

variables {
  subscription_id = "00000000-0000-0000-0000-000000000000"
}

run "baseline_default_deny" {
  command = plan
  assert {
    condition     = azurerm_network_security_rule.public["deny_inbound"].priority == 4096 && azurerm_network_security_rule.public["deny_inbound"].access == "Deny"
    error_message = "An explicit deny must override Azure's default VNet inbound allow."
  }
  assert {
    condition     = length(azurerm_network_security_rule.public) == 4 && length(azurerm_network_security_rule.platform) == 0
    error_message = "Default management ingress and platform exceptions must remain disabled."
  }
  assert {
    condition     = azurerm_subnet.private.default_outbound_access_enabled == false && azurerm_subnet.public.default_outbound_access_enabled == false
    error_message = "Neither subnet may enable implicit outbound access."
  }
  assert {
    condition     = azurerm_network_security_rule.database.source_address_prefix == var.public_subnet_cidr && azurerm_network_security_rule.database.destination_port_range == "5432"
    error_message = "Database ingress must be limited to the web subnet and chosen port."
  }
  assert {
    condition     = length(azurerm_linux_web_app.this) == 0 && length(azurerm_public_ip.web) == 0
    error_message = "Baseline must not allocate workloads or public IPs by default."
  }
}

run "restricted_management" {
  command = plan
  variables { admin_source_cidrs = ["198.51.100.7/32"] }
  assert {
    condition     = azurerm_network_security_rule.public["administration"].destination_port_range == "22" && azurerm_network_security_rule.public["administration"].source_address_prefixes == toset(["198.51.100.7/32"])
    error_message = "Management must be restricted to the selected protocol and trusted CIDR."
  }
}

run "reject_public_management" {
  command = plan
  variables { admin_source_cidrs = ["0.0.0.0/0"] }
  expect_failures = [var.admin_source_cidrs]
}

run "managed_workload_security" {
  command = plan
  variables {
    enable_workloads         = true
    postgres_admin_object_id = "11111111-1111-1111-1111-111111111111"
    postgres_admin_name      = "operator@example.invalid"
  }
  assert {
    condition     = !azurerm_postgresql_flexible_server.this[0].public_network_access_enabled && !azurerm_postgresql_flexible_server.this[0].authentication[0].password_auth_enabled
    error_message = "PostgreSQL must have no public access or password authentication."
  }
  assert {
    condition     = azurerm_linux_web_app.this[0].https_only && !azurerm_linux_web_app.this[0].webdeploy_publish_basic_authentication_enabled && azurerm_linux_web_app.this[0].site_config[0].scm_ip_restriction_default_action == "Deny"
    error_message = "HTTPS enforcement and closed-by-default SCM are required."
  }
  assert {
    condition     = length(azurerm_network_security_rule.platform) == 7 && length(azurerm_subnet_nat_gateway_association.database) == 1
    error_message = "Managed workloads require platform exceptions and explicit NAT transport."
  }
  assert {
    condition     = !contains(keys(azurerm_linux_web_app.this[0].app_settings), "PGPASSWORD")
    error_message = "Runtime app settings must not contain a database password."
  }
}

run "workload_requires_operator" {
  command = plan
  variables { enable_workloads = true }
  expect_failures = [var.enable_workloads]
}

run "reject_overlapping_subnets" {
  command = plan
  variables { private_subnet_cidr = "10.20.1.128/25" }
  expect_failures = [azurerm_virtual_network.this]
}

run "reject_subnet_outside_vnet" {
  command = plan
  variables { private_subnet_cidr = "10.21.2.0/24" }
  expect_failures = [azurerm_virtual_network.this]
}
