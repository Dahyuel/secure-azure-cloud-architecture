# Optional managed workload profile. App Service public ingress does NOT traverse
# the integration subnet: IP access restrictions and HTTPS enforce that boundary.
data "azurerm_client_config" "current" {}

locals {
  workload_name = "${local.name}-${var.deployment_suffix}"
  # PostgreSQL needs internal replication, regional Storage and Entra egress.
  # These exceptions are intentionally absent from the baseline network profile.
  platform_rules = var.enable_workloads ? {
    postgres_internal_inbound  = { tier = "database", name = "postgres-internal-inbound", priority = 110, direction = "Inbound", protocol = "Tcp", source = var.private_subnet_cidr, destination = var.private_subnet_cidr, port = "5432" }
    postgres_internal_outbound = { tier = "database", name = "postgres-internal-outbound", priority = 110, direction = "Outbound", protocol = "Tcp", source = var.private_subnet_cidr, destination = var.private_subnet_cidr, port = "5432" }
    web_entra                  = { tier = "web", name = "entra-outbound", priority = 120, direction = "Outbound", protocol = "Tcp", source = var.public_subnet_cidr, destination = "AzureActiveDirectory", port = "443" }
    database_entra             = { tier = "database", name = "entra-outbound", priority = 120, direction = "Outbound", protocol = "Tcp", source = var.private_subnet_cidr, destination = "AzureActiveDirectory", port = "443" }
    database_storage           = { tier = "database", name = "storage-outbound", priority = 130, direction = "Outbound", protocol = "Tcp", source = var.private_subnet_cidr, destination = "Storage.${var.location}", port = "443" }
    web_dns                    = { tier = "web", name = "azure-dns", priority = 140, direction = "Outbound", protocol = "*", source = var.public_subnet_cidr, destination = "168.63.129.16/32", port = "53" }
    database_dns               = { tier = "database", name = "azure-dns", priority = 140, direction = "Outbound", protocol = "*", source = var.private_subnet_cidr, destination = "168.63.129.16/32", port = "53" }
  } : {}
}

resource "azurerm_network_security_rule" "platform" {
  for_each                    = local.platform_rules
  name                        = each.value.name
  priority                    = each.value.priority
  direction                   = each.value.direction
  access                      = "Allow"
  protocol                    = each.value.protocol
  source_port_range           = "*"
  destination_port_range      = each.value.port
  source_address_prefix       = each.value.source
  destination_address_prefix  = each.value.destination
  resource_group_name         = azurerm_resource_group.this.name
  network_security_group_name = each.value.tier == "web" ? azurerm_network_security_group.public.name : azurerm_network_security_group.private.name
}

resource "azurerm_private_dns_zone" "postgres" {
  count               = var.enable_workloads ? 1 : 0
  name                = "${var.project_name}-${var.deployment_suffix}.private.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  count                 = var.enable_workloads ? 1 : 0
  name                  = "postgres-vnet-link"
  resource_group_name   = azurerm_resource_group.this.name
  private_dns_zone_name = azurerm_private_dns_zone.postgres[0].name
  virtual_network_id    = azurerm_virtual_network.this.id
  registration_enabled  = false
  tags                  = local.tags
}

resource "azurerm_postgresql_flexible_server" "this" {
  count                         = var.enable_workloads ? 1 : 0
  name                          = "pg-${local.workload_name}"
  resource_group_name           = azurerm_resource_group.this.name
  location                      = azurerm_resource_group.this.location
  version                       = "16"
  delegated_subnet_id           = azurerm_subnet.private.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres[0].id
  public_network_access_enabled = false
  sku_name                      = var.postgres_sku
  storage_mb                    = 32768
  backup_retention_days         = 14
  geo_redundant_backup_enabled  = var.postgres_geo_redundant_backup
  zone                          = var.postgres_zone
  tags                          = local.tags

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = false
    tenant_id                     = data.azurerm_client_config.current.tenant_id
  }
  dynamic "high_availability" {
    for_each = var.postgres_ha_mode == null ? [] : [var.postgres_ha_mode]
    content { mode = high_availability.value }
  }
  maintenance_window {
    day_of_week  = 0
    start_hour   = 2
    start_minute = 0
  }
  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres, azurerm_subnet_network_security_group_association.private, azurerm_subnet_nat_gateway_association.database]
}

resource "azurerm_postgresql_flexible_server_active_directory_administrator" "operator" {
  count               = var.enable_workloads ? 1 : 0
  server_name         = azurerm_postgresql_flexible_server.this[0].name
  resource_group_name = azurerm_resource_group.this.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  object_id           = var.postgres_admin_object_id
  principal_name      = var.postgres_admin_name
  principal_type      = var.postgres_admin_type
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  count     = var.enable_workloads ? 1 : 0
  name      = "sentinellab"
  server_id = azurerm_postgresql_flexible_server.this[0].id
  collation = "en_US.utf8"
  charset   = "UTF8"
}

resource "azurerm_postgresql_flexible_server_configuration" "tls" {
  count     = var.enable_workloads ? 1 : 0
  name      = "require_secure_transport"
  server_id = azurerm_postgresql_flexible_server.this[0].id
  value     = "on"
}

resource "azurerm_postgresql_flexible_server_configuration" "connections" {
  count     = var.enable_workloads ? 1 : 0
  name      = "log_connections"
  server_id = azurerm_postgresql_flexible_server.this[0].id
  value     = "on"
}

resource "azurerm_service_plan" "this" {
  count               = var.enable_workloads ? 1 : 0
  name                = "asp-${local.workload_name}"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  os_type             = "Linux"
  sku_name            = var.app_service_sku
  tags                = local.tags
}

resource "azurerm_linux_web_app" "this" {
  count                                          = var.enable_workloads ? 1 : 0
  name                                           = "app-${local.workload_name}"
  resource_group_name                            = azurerm_resource_group.this.name
  location                                       = azurerm_resource_group.this.location
  service_plan_id                                = azurerm_service_plan.this[0].id
  virtual_network_subnet_id                      = azurerm_subnet.public.id
  https_only                                     = true
  public_network_access_enabled                  = true
  ftp_publish_basic_authentication_enabled       = false
  webdeploy_publish_basic_authentication_enabled = false
  tags                                           = local.tags

  identity { type = "SystemAssigned" }

  site_config {
    always_on                         = true
    minimum_tls_version               = "1.2"
    scm_minimum_tls_version           = "1.2"
    ftps_state                        = "Disabled"
    http2_enabled                     = true
    remote_debugging_enabled          = false
    health_check_path                 = "/healthz"
    health_check_eviction_time_in_min = 5
    vnet_route_all_enabled            = true
    app_command_line                  = "node app/server.mjs"
    ip_restriction_default_action     = "Deny"
    scm_ip_restriction_default_action = "Deny"
    scm_use_main_ip_restriction       = false

    application_stack { node_version = "22-lts" }

    dynamic "ip_restriction" {
      for_each = { for index, source in var.web_source_cidrs : tostring(index) => source }
      content {
        name       = "approved-client-${ip_restriction.key}"
        ip_address = ip_restriction.value
        priority   = 100 + tonumber(ip_restriction.key)
        action     = "Allow"
      }
    }
    dynamic "scm_ip_restriction" {
      for_each = { for index, source in var.scm_source_cidrs : tostring(index) => source }
      content {
        name       = "temporary-operator-${scm_ip_restriction.key}"
        ip_address = scm_ip_restriction.value
        priority   = 100 + tonumber(scm_ip_restriction.key)
        action     = "Allow"
      }
    }
  }

  # Code is packaged with dependencies locally; deployment needs no internet
  # package download from a subnet whose egress is intentionally restricted.
  app_settings = {
    APP_MODE                       = "azure"
    HOST                           = "0.0.0.0"
    NODE_ENV                       = "production"
    SCM_DO_BUILD_DURING_DEPLOYMENT = "false"
    WEBSITE_RUN_FROM_PACKAGE       = "1"
    DB_AUTH                        = "managed_identity"
    PGHOST                         = azurerm_postgresql_flexible_server.this[0].fqdn
    PGDATABASE                     = azurerm_postgresql_flexible_server_database.app[0].name
    PGUSER                         = "sentinel_app"
    PGPORT                         = "5432"
    PROJECT_NAME                   = var.project_name
    ENVIRONMENT                    = var.environment
    LOCATION                       = var.location
    VNET_CIDR                      = var.vnet_cidr
    PUBLIC_SUBNET_CIDR             = var.public_subnet_cidr
    PRIVATE_SUBNET_CIDR            = var.private_subnet_cidr
    WEB_SOURCE_CIDRS               = jsonencode(var.web_source_cidrs)
    ADMIN_SOURCE_CIDRS             = "[]"
    DATABASE_PORT                  = "5432"
  }

  logs {
    detailed_error_messages = false
    failed_request_tracing  = false
    http_logs {
      file_system {
        retention_in_days = 7
        retention_in_mb   = 35
      }
    }
  }
  depends_on = [azurerm_subnet_network_security_group_association.public, azurerm_subnet_nat_gateway_association.web]
}
