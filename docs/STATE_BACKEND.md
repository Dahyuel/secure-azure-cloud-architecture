# Terraform state backend

For collaboration, bootstrap state storage separately from the app group. Use Entra data-plane auth, narrow Blob access, private connectivity, versioning/soft-delete and recovery procedures. Azure Blob leases provide locking. Local lab state is ignored by Git.

Add a local reviewed `backend.tf`:

```hcl
terraform {
  backend "azurerm" {}
}
```

Initialize with nonsecret metadata:

```sh
terraform init \
  -backend-config="resource_group_name=YOUR_STATE_GROUP" \
  -backend-config="storage_account_name=YOUR_STATE_ACCOUNT" \
  -backend-config="container_name=tfstate" \
  -backend-config="key=secure-azure/production.tfstate" \
  -backend-config="use_azuread_auth=true"
```

Use CLI locally or OIDC in CI, not keys/secrets in arguments/files. Control-plane rights do not imply blob rights. Protect plans and local backend metadata. Migrate existing state through a reviewed `init -migrate-state`, preserve recovery copies, and use distinct keys per environment. Never commit state, backups, plans, `.terraform` or private tfvars.
