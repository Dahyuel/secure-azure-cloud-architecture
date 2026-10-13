# Contributing

Use focused PRs explaining the problem, behavior, security implications and evidence. Discuss major architecture changes first. Never include private deployment data.

```sh
npm ci --ignore-scripts
npm run check
npm run format:check
npm test
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform test
```

For container changes, verify real DB health with a fresh disposable test volume; do not delete existing user data for testing. Use minimal Node ESM dependencies, accessible HTML, responsive CSS and escaped dynamic content. Avoid arbitrary command/SQL/probe endpoints. Keep shared policy and Terraform aligned with boundary tests; update docs/threat assumptions for permission/path changes. Mock tests do not replace live acceptance.
