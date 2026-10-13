# Explicit outbound transport for the managed workload profile. NAT never permits
# inbound database access; the NSGs still restrict allowed egress destinations.
resource "azurerm_public_ip" "egress" {
  count               = var.enable_workloads ? 1 : 0
  name                = "pip-egress-${local.workload_name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

resource "azurerm_nat_gateway" "this" {
  count                   = var.enable_workloads ? 1 : 0
  name                    = "nat-${local.workload_name}"
  location                = azurerm_resource_group.this.location
  resource_group_name     = azurerm_resource_group.this.name
  sku_name                = "Standard"
  idle_timeout_in_minutes = 4
  tags                    = local.tags
}

resource "azurerm_nat_gateway_public_ip_association" "this" {
  count                = var.enable_workloads ? 1 : 0
  nat_gateway_id       = azurerm_nat_gateway.this[0].id
  public_ip_address_id = azurerm_public_ip.egress[0].id
}

resource "azurerm_subnet_nat_gateway_association" "web" {
  count          = var.enable_workloads ? 1 : 0
  subnet_id      = azurerm_subnet.public.id
  nat_gateway_id = azurerm_nat_gateway.this[0].id
  depends_on     = [azurerm_nat_gateway_public_ip_association.this]
}

resource "azurerm_subnet_nat_gateway_association" "database" {
  count          = var.enable_workloads ? 1 : 0
  subnet_id      = azurerm_subnet.private.id
  nat_gateway_id = azurerm_nat_gateway.this[0].id
  depends_on     = [azurerm_nat_gateway_public_ip_association.this]
}
