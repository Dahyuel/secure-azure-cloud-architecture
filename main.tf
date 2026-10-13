# Secure network foundation, optionally extended with managed application workloads.
terraform {
  required_version = ">= 1.9.0, < 2.0.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.77"
    }
  }
}

# Authenticate with Azure CLI locally or workload identity federation in CI.
# Pre-register Microsoft.Network with a separate privileged bootstrap identity.
provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
}

locals {
  # Validate numeric IPv4 bounds before any Azure request.
  network_ranges = {
    for key, network in { vnet = var.vnet_cidr, web = var.public_subnet_cidr, database = var.private_subnet_cidr } : key => {
      start                    = try(sum([for index, octet in split(".", cidrhost(network, 0)) : tonumber(octet) * pow(256, 3 - index)]), 0)
      end                      = try(sum([for index, octet in split(".", cidrhost(network, -1)) : tonumber(octet) * pow(256, 3 - index)]), 0)
      bits                     = try(tonumber(split("/", network)[1]), 32)
    }
  }
  name = "${var.project_name}-${var.environment}"
  tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Project     = var.project_name
  })
  # All allows precede the explicit denies, overriding Azure's default VNet allows.
  public_rules = merge({
    web = {
      priority = 100, direction = "Inbound", access = "Allow", protocol = "Tcp"
      sources  = var.web_source_cidrs, destination = var.public_subnet_cidr
      ports    = ["80", "443"]
    }
    database = {
      priority = 100, direction = "Outbound", access = "Allow", protocol = "Tcp"
      sources  = [var.public_subnet_cidr], destination = var.private_subnet_cidr
      ports    = [tostring(var.database_port)]
    }
    deny_inbound = {
      priority = 4096, direction = "Inbound", access = "Deny", protocol = "*"
      sources  = ["*"], destination = "*", ports = ["*"]
    }
    deny_outbound = {
      priority = 4096, direction = "Outbound", access = "Deny", protocol = "*"
      sources  = ["*"], destination = "*", ports = ["*"]
    }
    }, length(var.admin_source_cidrs) > 0 ? {
    administration = {
      priority = 110, direction = "Inbound", access = "Allow", protocol = "Tcp"
      sources  = var.admin_source_cidrs, destination = var.public_subnet_cidr
      ports    = [tostring(var.admin_port)]
    }
  } : {})
}

resource "azurerm_resource_group" "this" {
  name     = "rg-${local.name}"
  location = var.location
  tags     = local.tags
}

resource "azurerm_virtual_network" "this" {
  name                = "vnet-${local.name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  address_space       = [var.vnet_cidr]
  tags                = local.tags
  lifecycle {
    precondition {
      condition     = alltrue([for subnet in [local.network_ranges.web, local.network_ranges.database] : subnet.start >= local.network_ranges.vnet.start && subnet.end <= local.network_ranges.vnet.end])
      error_message = "Both subnet ranges must be contained within the VNet."
    }
    precondition {
      condition     = local.network_ranges.web.end < local.network_ranges.database.start || local.network_ranges.database.end < local.network_ranges.web.start
      error_message = "Web and database subnet ranges must not overlap."
    }
    precondition {
      condition     = local.network_ranges.web.bits <= 28 && local.network_ranges.database.bits <= 28
      error_message = "Azure subnet ranges must be /28 or larger."
    }
  }
}

resource "azurerm_subnet" "public" {
  name                            = "snet-web"
  resource_group_name             = azurerm_resource_group.this.name
  virtual_network_name            = azurerm_virtual_network.this.name
  address_prefixes                = [var.public_subnet_cidr]
  default_outbound_access_enabled = false

  dynamic "delegation" {
    for_each = var.enable_workloads ? [1] : []
    content {
      name = "app-service"
      service_delegation {
        name    = "Microsoft.Web/serverFarms"
        actions = ["Microsoft.Network/virtualNetworks/subnets/action"]
      }
    }
  }
}

resource "azurerm_subnet" "private" {
  name                            = "snet-database"
  resource_group_name             = azurerm_resource_group.this.name
  virtual_network_name            = azurerm_virtual_network.this.name
  address_prefixes                = [var.private_subnet_cidr]
  default_outbound_access_enabled = false
  service_endpoints               = var.enable_workloads ? ["Microsoft.Storage"] : []

  dynamic "delegation" {
    for_each = var.enable_workloads ? [1] : []
    content {
      name = "postgresql"
      service_delegation {
        name    = "Microsoft.DBforPostgreSQL/flexibleServers"
        actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
      }
    }
  }
}

resource "azurerm_network_security_group" "public" {
  name                = "nsg-web-${local.name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.tags
}

resource "azurerm_network_security_group" "private" {
  name                = "nsg-database-${local.name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.tags
}

# Standalone rules are used consistently; do not mix with inline NSG rules.
resource "azurerm_network_security_rule" "public" {
  for_each                    = local.public_rules
  name                        = replace(each.key, "deny_", "deny-all-")
  priority                    = each.value.priority
  direction                   = each.value.direction
  access                      = each.value.access
  protocol                    = each.value.protocol
  source_port_range           = "*"
  destination_port_range      = length(each.value.ports) == 1 ? each.value.ports[0] : null
  destination_port_ranges     = length(each.value.ports) > 1 ? each.value.ports : null
  source_address_prefix       = each.value.sources[0] == "*" ? "*" : null
  source_address_prefixes     = each.value.sources[0] == "*" ? null : each.value.sources
  destination_address_prefix  = each.value.destination
  resource_group_name         = azurerm_resource_group.this.name
  network_security_group_name = azurerm_network_security_group.public.name
}

# The private tier accepts only the selected database protocol from the web tier.
resource "azurerm_network_security_rule" "database" {
  name                        = "web-to-database"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = tostring(var.database_port)
  source_address_prefix       = var.public_subnet_cidr
  destination_address_prefix  = var.private_subnet_cidr
  resource_group_name         = azurerm_resource_group.this.name
  network_security_group_name = azurerm_network_security_group.private.name
}

resource "azurerm_network_security_rule" "private_deny" {
  for_each                    = toset(["Inbound", "Outbound"])
  name                        = "deny-all-${lower(each.key)}"
  priority                    = 4096
  direction                   = each.key
  access                      = "Deny"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = azurerm_resource_group.this.name
  network_security_group_name = azurerm_network_security_group.private.name
}

# Attach NSGs only after the deny rules exist, avoiding default-only associations.
resource "azurerm_subnet_network_security_group_association" "public" {
  subnet_id                 = azurerm_subnet.public.id
  network_security_group_id = azurerm_network_security_group.public.id
  depends_on                = [azurerm_network_security_rule.public, azurerm_network_security_rule.platform]
}

resource "azurerm_subnet_network_security_group_association" "private" {
  subnet_id                 = azurerm_subnet.private.id
  network_security_group_id = azurerm_network_security_group.private.id
  depends_on                = [azurerm_network_security_rule.database, azurerm_network_security_rule.private_deny, azurerm_network_security_rule.platform]
}

# Allocation alone does not expose a service. Attach to a reviewed web-tier NIC
# or load balancer in a workload module; never attach to the private tier.
resource "azurerm_public_ip" "web" {
  count               = var.allocate_web_public_ip ? 1 : 0
  name                = "pip-web-${local.name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

# Read-only access scoped to this resource group, not the subscription.
# Terraform's deployer needs separate permissions to create these assignments.
resource "azurerm_role_assignment" "reader" {
  for_each             = var.reader_principal_ids
  scope                = azurerm_resource_group.this.id
  role_definition_name = "Reader"
  principal_id         = each.value
}
