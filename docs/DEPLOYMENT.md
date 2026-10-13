# Deploy to Azure

Local mode needs no Azure account. This guide creates billable commercial-Azure resources and assumes authorized subscription access. Regional SKU availability and sovereign endpoints require separate review.

## 1. Tooling, identity and state

Use Terraform 1.9–1.x, Node.js 22 LTS and current Azure CLI:

```sh
az login
az account set --subscription YOUR_SUBSCRIPTION_UUID
az provider register --namespace Microsoft.Network --wait
az provider register --namespace Microsoft.Web --wait
az provider register --namespace Microsoft.DBforPostgreSQL --wait
az provider register --namespace Microsoft.OperationalInsights --wait
az provider register --namespace Microsoft.Insights --wait
```

Provider registration is a privileged bootstrap operation; automatic registration is disabled. Group creation needs parent-scope rights, optional Reader grants need role-assignment write rights, and ongoing resource changes should use narrower permissions. Runtime identity receives no Azure resource-group/subscription role.

Select an existing Entra user/group administrator for PostgreSQL. Entra-only creation may require the PostgreSQL service principal to exist in the tenant; ask the tenant admin to resolve provisioning failures. Never select the app runtime identity as DB admin. For collaboration, bootstrap a separate protected state backend using [STATE_BACKEND.md](STATE_BACKEND.md). Commit the provider lock file and review upgrades.

## 2. Inputs

Copy `terraform.tfvars.example` to ignored `terraform.tfvars`. PowerShell: `Copy-Item terraform.tfvars.example terraform.tfvars`. Fill real values:

```hcl
subscription_id         = "YOUR_SUBSCRIPTION_UUID"
enable_workloads         = true
deployment_suffix        = "youruniquesuffix"
postgres_admin_object_id = "YOUR_ENTRA_OBJECT_UUID"
postgres_admin_name      = "your-operator-UPN-or-group-name"
postgres_admin_type      = "User"
admin_source_cidrs       = []
allocate_web_public_ip   = false
scm_source_cidrs         = ["YOUR_TRUSTED_PUBLIC_IPV4/32"]
```

Replace placeholders. Verify your operator public IP through an approved source. Unique names and SKU capacity are validated by Azure. Workloads require port 5432, empty VM management CIDRs, web subnet /26 or larger and no unattached baseline IP. The GUI export omits operator identity values; add those locally.

Public web clients are deliberate by default (`0.0.0.0/0`); restrict `web_source_cidrs` if metadata is private. SCM permits only the temporary operator range; basic publishing credentials remain disabled.

## 3. Review and provision

```sh
terraform init
terraform fmt -check -recursive
terraform validate
terraform test
terraform plan -out=deployment.tfplan
terraform show deployment.tfplan
terraform apply deployment.tfplan
```

Review resource replacement, cost and service exceptions. This provisions resources, not app source or the DB runtime role. Never apply a stale saved plan after input/state changes.

## 4. Deploy the application

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run package:azure
```

Artifacts: `dist/app.zip` and `dist/app.sha256`. They exclude credentials and Terraform data. PowerShell deployment:

```powershell
$deploymentGroup = terraform output -raw resource_group_name
$deploymentApp = terraform output -raw application_name
az webapp deploy --resource-group $deploymentGroup --name $deploymentApp --src-path dist/app.zip --type zip
az webapp ssh --resource-group $deploymentGroup --name $deploymentApp
```

Use the Entra-authenticated CLI flow. SCM 403 usually requires correcting your temporary trusted IP; do not enable basic auth or allow all internet SCM. Dependencies are prepackaged, so no runtime npm download is needed. The GUI loads before DB bootstrap and honestly reports unavailable DB connectivity.

## 5. Bootstrap the CONNECT-only DB login

Obtain `terraform output -raw application_principal_id` (managed identity **object ID**, not client ID). As the configured Entra admin or group member, acquire a short-lived token for `https://ossrdbms-aad.database.windows.net`. Keep it in session memory; never add it to tfvars, app settings, logs or issues.

Azure CLI supports the following command, which displays a secret. Use a trusted unrecorded terminal and handle the output as a privileged credential:

```sh
az account get-access-token --resource https://ossrdbms-aad.database.windows.net --query accessToken --output tsv
```

From the authorized App Service SSH console, inside the private network path:

```sh
cd /home/site/wwwroot
export ADMIN_PGUSER='YOUR_CONFIGURED_ENTRA_ADMIN_NAME'
export APP_PRINCIPAL_ID='YOUR_APP_MANAGED_IDENTITY_OBJECT_UUID'
read -rsp 'Short-lived Entra administrator token: ' ADMIN_ACCESS_TOKEN
echo
export ADMIN_ACCESS_TOKEN
node scripts/bootstrap-database.mjs
unset ADMIN_ACCESS_TOKEN ADMIN_PGUSER APP_PRINCIPAL_ID
```

The prompt hides token input. `PGHOST` is already configured. Bootstrap binds `sentinel_app` to the object ID in `postgres`, then grants CONNECT on `sentinellab` without schema/table/admin grants. The runtime process fetches its own identity token and does not inherit the operator shell token.

The script refuses an existing role; inspect partial creation or previous identity binding before retrying. See [OPERATIONS.md](OPERATIONS.md) and [Microsoft Entra role management](https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-entra-users). For hardened production operation, replace manual token movement with a private federated operator runner.

## 6. Close SCM and collect evidence

Set `scm_source_cidrs = []`, review/apply a fresh plan, and keep SCM closed between deployments. Open the HTTPS URL from `terraform output -raw application_url`. Confirm an observed DB connection using managed identity and verified TLS.

Run [the acceptance checks](evidence/ACCEPTANCE_TEMPLATE.md). App Service ingress restrictions and private DB NSGs enforce different boundaries. Mock tests and a pretty dashboard are not evidence of deployed controls.

## Deployment CI

Included workflows need no Azure credentials and never apply Terraform. For deployment automation, create repository/environment-bound Entra OIDC federation, narrow permissions, protected environment reviewers and a runner with approved SCM/private connectivity. Do not broadly open SCM for convenience. DB admin bootstrap belongs in a separate operator job.

## Cleanup

```sh
terraform plan -destroy -out=destroy.tfplan
terraform show destroy.tfplan
terraform apply destroy.tfplan
```

Preserve required data/evidence first. Destruction deletes the managed DB and dedicated group; resources added outside Terraform can be affected by group deletion.
