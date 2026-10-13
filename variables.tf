variable "subscription_id" {
  description = "Azure subscription UUID. Authentication uses CLI or federated identity, not stored credentials."
  type        = string
  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.subscription_id))
    error_message = "Provide an Azure subscription UUID."
  }
}

variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "eastus"
  validation {
    condition     = can(regex("^[a-z][a-z0-9]{2,30}$", var.location))
    error_message = "Use an Azure region identifier such as eastus."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string
  default     = "production"
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Use development, staging, or production."
  }
}

variable "project_name" {
  description = "Short lowercase project identifier used in resource names."
  type        = string
  default     = "secure-azure"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,29}$", var.project_name))
    error_message = "Use 3–30 lowercase letters, digits, or hyphens, starting with a letter."
  }
}

variable "vnet_cidr" {
  description = "IPv4 VNet CIDR; subnet CIDRs must be contained and nonoverlapping."
  type        = string
  default     = "10.20.0.0/16"
  validation {
    condition     = can(cidrnetmask(var.vnet_cidr))
    error_message = "Provide a valid IPv4 CIDR."
  }
}

variable "public_subnet_cidr" {
  description = "Web-tier IPv4 CIDR inside the VNet."
  type        = string
  default     = "10.20.1.0/24"
  validation {
    condition     = can(cidrnetmask(var.public_subnet_cidr))
    error_message = "Provide a valid IPv4 CIDR."
  }
}

variable "private_subnet_cidr" {
  description = "Database-tier IPv4 CIDR inside the VNet, disjoint from the web tier. Azure validates containment and overlap."
  type        = string
  default     = "10.20.2.0/24"
  validation {
    condition     = can(cidrnetmask(var.private_subnet_cidr))
    error_message = "Provide a valid IPv4 CIDR."
  }
}

variable "web_source_cidrs" {
  description = "IPv4 client networks permitted on TCP 80/443. Internet access is deliberate and configurable."
  type        = list(string)
  default     = ["0.0.0.0/0"]
  validation {
    condition     = length(var.web_source_cidrs) > 0 && alltrue([for cidr in var.web_source_cidrs : can(cidrnetmask(cidr))])
    error_message = "Specify at least one valid IPv4 CIDR."
  }
}

variable "admin_source_cidrs" {
  description = "Trusted administrator IPv4 networks. Empty disables administrative ingress. Broad ranges shorter than /24 are rejected."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for cidr in var.admin_source_cidrs : can(cidrnetmask(cidr)) && try(tonumber(split("/", cidr)[1]) >= 24, false)])
    error_message = "Administrative sources must be valid IPv4 CIDRs with /24 or narrower prefixes; prefer /32."
  }
}

variable "admin_port" {
  description = "Single management protocol: SSH (22) or RDP (3389). Only enabled when trusted source CIDRs are supplied."
  type        = number
  default     = 22
  validation {
    condition     = contains([22, 3389], var.admin_port)
    error_message = "Choose 22 for SSH or 3389 for RDP."
  }
}

variable "database_port" {
  description = "Database TCP port allowed from web to database (default PostgreSQL)."
  type        = number
  default     = 5432
  validation {
    condition     = var.database_port >= 1 && var.database_port <= 65535 && floor(var.database_port) == var.database_port
    error_message = "Use an integer TCP port between 1 and 65535."
  }
}

variable "allocate_web_public_ip" {
  description = "Allocate an unattached Standard static web IP; incurs Azure charges."
  type        = bool
  default     = false
}

variable "reader_principal_ids" {
  description = "Existing Microsoft Entra object IDs receiving resource-group Reader access; not application/client IDs."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for id in var.reader_principal_ids : can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", id))])
    error_message = "Each principal ID must be a UUID."
  }
}

variable "tags" {
  description = "Additional ownership, cost-center, and classification tags. Do not include secrets."
  type        = map(string)
  default     = {}
}

variable "enable_workloads" {
  description = "Deploy App Service, private PostgreSQL, private DNS and monitoring. Creates billable services."
  type        = bool
  default     = false
  validation {
    condition     = !var.enable_workloads || (var.database_port == 5432 && length(var.admin_source_cidrs) == 0 && !var.allocate_web_public_ip)
    error_message = "Workloads require database port 5432, no VM management CIDRs, and no unattached public IP allocation."
  }
  validation {
    condition     = !var.enable_workloads || (try(tonumber(split("/", var.public_subnet_cidr)[1]) <= 26, false))
    error_message = "Workloads require an App Service integration subnet of /26 or larger."
  }
  validation {
    condition     = !var.enable_workloads || (var.postgres_admin_object_id != null && var.postgres_admin_name != null)
    error_message = "Workloads require postgres_admin_object_id and postgres_admin_name for an existing Entra administrator."
  }
}

variable "deployment_suffix" {
  description = "Globally unique lowercase suffix for App Service and PostgreSQL DNS names. Customize before Azure deployment."
  type        = string
  default     = "portfolio01"
  validation {
    condition     = can(regex("^[a-z0-9]{3,12}$", var.deployment_suffix))
    error_message = "Use 3–12 lowercase letters or digits."
  }
}

variable "postgres_admin_object_id" {
  description = "Existing Entra administrator object ID. Must be an operator identity, not the web app runtime identity."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.postgres_admin_object_id == null || can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", var.postgres_admin_object_id))
    error_message = "Provide a valid Entra object UUID."
  }
}

variable "postgres_admin_name" {
  description = "Entra administrator principal name (user UPN or group name), also used when connecting for bootstrap."
  type        = string
  default     = null
  validation {
    condition     = var.postgres_admin_name == null || try(length(trimspace(var.postgres_admin_name)) > 0, false)
    error_message = "Administrator name cannot be empty."
  }
}

variable "postgres_admin_type" {
  description = "Type of the existing Entra administrator."
  type        = string
  default     = "User"
  validation {
    condition     = contains(["User", "Group", "ServicePrincipal"], var.postgres_admin_type)
    error_message = "Choose User, Group or ServicePrincipal."
  }
}

variable "app_service_sku" {
  description = "Linux App Service SKU. B1 is a portfolio baseline; P1v3 is appropriate for supported production scaling features."
  type        = string
  default     = "B1"
  validation {
    condition     = contains(["B1", "B2", "B3", "P1v3", "P2v3", "P3v3"], var.app_service_sku)
    error_message = "Select a supported Basic or Premium v3 SKU."
  }
}

variable "postgres_sku" {
  description = "PostgreSQL SKU; burstable default is for a portfolio lab, not an availability SLA."
  type        = string
  default     = "B_Standard_B1ms"
  validation {
    condition     = can(regex("^(B|GP|MO)_Standard_[A-Za-z0-9_]+$", var.postgres_sku))
    error_message = "Use an Azure PostgreSQL Flexible Server SKU such as B_Standard_B1ms."
  }
}

variable "postgres_ha_mode" {
  description = "Optional SameZone or ZoneRedundant HA. Requires a supported non-burstable SKU and regional capacity."
  type        = string
  default     = null
  validation {
    condition     = var.postgres_ha_mode == null || contains(["SameZone", "ZoneRedundant"], var.postgres_ha_mode)
    error_message = "HA must be null, SameZone or ZoneRedundant."
  }
  validation {
    condition     = var.postgres_ha_mode == null || !startswith(var.postgres_sku, "B_")
    error_message = "High availability is not supported on burstable PostgreSQL SKUs."
  }
}

variable "postgres_zone" {
  description = "Optional availability zone supported by the selected region."
  type        = string
  default     = null
}

variable "postgres_geo_redundant_backup" {
  description = "Enable geo-redundant backups when supported by the selected region; changing this can replace the server."
  type        = bool
  default     = false
}

variable "scm_source_cidrs" {
  description = "Temporary trusted IPv4 ranges for Azure CLI ZIP deployment/SSH console. Empty denies SCM ingress. Remove after deployment."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for cidr in var.scm_source_cidrs : can(cidrnetmask(cidr)) && try(tonumber(split("/", cidr)[1]) >= 24, false)])
    error_message = "SCM access must use /24 or narrower trusted IPv4 CIDRs; prefer /32."
  }
}
