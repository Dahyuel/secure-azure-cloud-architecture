# Centralized resource logs. Diagnostics describe real Azure observations;
# the public GUI does not impersonate an Azure security monitoring service.
resource "azurerm_log_analytics_workspace" "this" {
  count               = var.enable_workloads ? 1 : 0
  name                = "law-${local.workload_name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 1
  tags                = local.tags
}

resource "azurerm_monitor_diagnostic_setting" "web" {
  count                      = var.enable_workloads ? 1 : 0
  name                       = "web-centralized-logs"
  target_resource_id         = azurerm_linux_web_app.this[0].id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this[0].id
  enabled_log { category_group = "allLogs" }
  enabled_metric { category = "AllMetrics" }
}

resource "azurerm_monitor_diagnostic_setting" "database" {
  count                      = var.enable_workloads ? 1 : 0
  name                       = "postgres-centralized-logs"
  target_resource_id         = azurerm_postgresql_flexible_server.this[0].id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this[0].id
  enabled_log { category_group = "allLogs" }
  enabled_metric { category = "AllMetrics" }
}

# An Azure Monitor alert is recorded without sending email. Operators can wire
# an action group after selecting an incident-response destination.
resource "azurerm_monitor_metric_alert" "database_cpu" {
  count               = var.enable_workloads ? 1 : 0
  name                = "postgres-sustained-cpu-${local.workload_name}"
  resource_group_name = azurerm_resource_group.this.name
  scopes              = [azurerm_postgresql_flexible_server.this[0].id]
  description         = "Average PostgreSQL CPU exceeds 80% for 15 minutes. Attach an approved action group for notifications."
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = "cpu_percent"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }
  tags = local.tags
}
